/**
 * 预警规则管理服务（系统管理 → 预警规则）。
 *
 * 职责：读取 alert_rule（R1–R5），并允许管理员修改其中**可配置**的部分：
 *   name / description / evaluate_order / enabled / params_json / calibration_status
 *
 * 为什么 `code` 不可改：规则编码（R1–R5）是代码与数据库之间的契约键 ——
 * src/lib/analysis/rules.ts 里 BUILTIN_RULES 用 code 匹配实现，
 * 引擎只对「代码里有实现」的编码生效（见 ruleEngine.loadRules()）。
 * 改 code 会让这条规则变成「只有配置、没有实现」的死配置，
 * 因此本服务显式拒绝，要求新增规则走代码发布。
 *
 * ── params_json 允许的键（逐个核对 rules.ts 的 numericParam 调用得到）──────
 *
 * 校验口径：**只允许该规则在 src/lib/analysis/rules.ts 中真正读取的键**。
 * 该文件里所有阈值都通过 `numericParam(context, key, fallback)` 读取，
 * 逐个核对后结果如下（其余键一律 422 并说明原因）：
 *
 *   R1 数据记录差异待核对 —— 不读取任何 params_json 键。
 *       R1 的比对容差来自 data_consistency_check.tolerance_value（每条核对记录自带），
 *       不是规则参数。因此历史种子里的 `tolerance_mm` / `match_window_minutes`
 *       从未被读取，属于无效配置，保存时会被拒绝（请删除）。
 *
 *   R2 原始测量数据错误或样管规格匹配待核对 —— 不读取任何 params_json 键。
 *       判定用的 10% / 20% 偏差比例写死在 rules.ts 的物理关系检查里。
 *
 *   R3 规格限值对照 —— 不读取任何 params_json 键。
 *       上下限来自 metric_spec_limit 表，按指标逐条维护。
 *
 *   R4 连续抽检点趋势变化待复核 —— 读取 3 个键：
 *       · consecutive            连续可比较点数（个，整数，≥2）。默认 3。
 *                                含义：从当前点向前追溯多少个「连续可比较」的抽检点
 *                                （含当前点）才做趋势比较，不足该点数不判定。
 *       · minimum_change_mm      趋势最小变化量（mm，数值，>0）。默认 0.015。
 *                                含义：窗口内首尾两点差值的绝对值达到该值才算趋势变化；
 *                                小于该值视为正常波动。
 *       · maximum_gap_minutes    相邻点最大间隔（分钟，数值，>0）。默认 240。
 *                                含义：相邻两个可比较点的抽检时间间隔超过该值即断开，
 *                                不再计入同一趋势窗口（避免把停线后的跳变当成连续趋势）。
 *       注意：`maximum_window_hours` 出现在 seed/migration 0005 的 params_json 里，
 *       但 rules.ts 并未读取它（趋势窗口固定为「同一生产日」，
 *       见 r4Trend 中 targetDay 的过滤），因此它同样属于无效键，会被 422 拒绝。
 *
 *   R5 兜底规则 —— 不读取任何 params_json 键。
 *
 * 值本身也必须合法：必须是有限数值；整数键（consecutive）不接受小数；
 * 超出合理范围会被 422 拒绝（范围见各键的 min/max）。
 *
 * 每次修改都写审计（module='system'，action='update'），detail 记录「改前 → 改后」。
 */
import { execute, query, queryOne, type RowDataPacket } from '../db';
import { AppError } from '../errors';
import { writeAudit } from '../audit';

/** 单个阈值参数的说明（用于接口注释、接口返回与页面表单提示） */
export interface RuleParamSpec {
  key: string;
  label: string;
  /** 单位；无量纲时为 null */
  unit: string | null;
  description: string;
  /** 默认值（与 rules.ts 里 numericParam 的 fallback 一致） */
  defaultValue: number;
  integer?: boolean;
  min?: number;
  max?: number;
}

/**
 * 规则编码 → 允许的阈值参数。
 * 编码不存在时按「不读取任何参数」处理（保守：宁可拒绝，不要写入死配置）。
 */
export const RULE_PARAM_SPECS: Record<string, RuleParamSpec[]> = {
  R1: [],
  R2: [],
  R3: [],
  R4: [
    {
      key: 'maximum_window_hours',
      label: '趋势比较窗口',
      unit: '小时',
      description:
        '从当前抽检点向前追溯的时间窗长度。不超过 24 小时时按「同一生产日」切分，' +
        '超过 24 小时则按滚动时间窗；跨日比较会把交接班、开停机造成的水平位移误判为趋势。',
      defaultValue: 24,
      integer: true,
      min: 4,
      max: 168,
    },
    {
      key: 'consecutive',
      label: '连续可比较点数',
      unit: '个',
      description:
        '从当前抽检点向前追溯的连续可比较点个数（含当前点），不足该点数不做趋势判定。',
      defaultValue: 3,
      integer: true,
      min: 2,
      max: 10,
    },
    {
      key: 'minimum_change_mm',
      label: '趋势最小变化量',
      unit: 'mm',
      description: '窗口内首尾两点差值的绝对值达到该值才算趋势变化，小于该值按正常波动处理。',
      defaultValue: 0.015,
      min: 0.000001,
      max: 10,
    },
    {
      key: 'maximum_gap_minutes',
      label: '相邻点最大间隔',
      unit: '分钟',
      description: '相邻两个可比较点的抽检时间间隔超过该值即断开，不再计入同一趋势窗口。',
      defaultValue: 240,
      min: 1,
      max: 1440,
    },
  ],
  R5: [],
};

/** 规则编码 → 被拒绝的常见无效键及其原因（用于给出可执行的 422 说明） */
const REJECTED_KEY_HINTS: Record<string, string> = {
  tolerance_mm:
    'R1 的比对容差来自数据一致性核对记录（data_consistency_check.tolerance_value），不是规则参数。',
  match_window_minutes: '规则未读取该键：R1 的比对窗口由核对记录自身的时间决定。',
  maximum_window_hours:
    '规则未读取该键：R4 的趋势窗口固定为「同一生产日」，需要更长窗口须修改代码后发布。',
  minimum_change: '键名不正确，R4 读取的是 minimum_change_mm（单位 mm）。',
  maximum_gap: '键名不正确，R4 读取的是 maximum_gap_minutes（单位 分钟）。',
};

export type CalibrationStatus = 'demo' | 'pending_field_validation' | 'validated';

export const CALIBRATION_OPTIONS: Array<{ value: CalibrationStatus; label: string }> = [
  { value: 'demo', label: '阈值待现场标定（demo）' },
  { value: 'pending_field_validation', label: '阈值待现场标定（待现场验证）' },
  { value: 'validated', label: '阈值已标定（validated）' },
];

export interface RuleRow {
  id: number;
  code: string;
  name: string;
  description: string | null;
  riskType: string;
  ruleCategory: string;
  evaluateOrder: number;
  enabled: boolean;
  calibrationStatus: CalibrationStatus;
  ruleVersion: string;
  isTerminal: boolean;
  metricId: number | null;
  /** 数据库中实际存储的参数（原样返回，便于识别无效键） */
  paramsJson: Record<string, unknown>;
  /** 该规则允许修改的参数键（来自 rules.ts 的 numericParam 核对结果） */
  allowedParams: RuleParamSpec[];
  /** 数据库中存了、但规则代码不会读取的键（保存时会被拒绝 / 清理） */
  invalidParams: string[];
  updatedAt: string;
}

interface AlertRuleDbRow extends RowDataPacket {
  id: number;
  code: string;
  name: string;
  description: string | null;
  risk_type: string;
  rule_category: string;
  evaluate_order: number;
  enabled: number;
  calibration_status: string;
  rule_version: string;
  is_terminal: number;
  metric_id: number | null;
  params_json: unknown;
  updated_at: string;
}

/** 解析 params_json：mysql2 对 JSON 列既可能返回对象也可能返回字符串 */
export function parseParamsJson(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>;
  return {};
}

function allowedKeysFor(code: string): string[] {
  return (RULE_PARAM_SPECS[code] ?? []).map((spec) => spec.key);
}

function toRuleRow(row: AlertRuleDbRow): RuleRow {
  const code = String(row.code);
  const paramsJson = parseParamsJson(row.params_json);
  const allowed = allowedKeysFor(code);
  return {
    id: Number(row.id),
    code,
    name: String(row.name),
    description: row.description === null ? null : String(row.description),
    riskType: String(row.risk_type),
    ruleCategory: String(row.rule_category),
    evaluateOrder: Number(row.evaluate_order),
    enabled: Number(row.enabled) === 1,
    calibrationStatus: String(row.calibration_status) as CalibrationStatus,
    ruleVersion: String(row.rule_version),
    isTerminal: Number(row.is_terminal) === 1,
    metricId: row.metric_id === null ? null : Number(row.metric_id),
    paramsJson,
    allowedParams: RULE_PARAM_SPECS[code] ?? [],
    invalidParams: Object.keys(paramsJson).filter((key) => !allowed.includes(key)),
    updatedAt: String(row.updated_at ?? ''),
  };
}

const SELECT_RULE = `SELECT id, code, name, description, risk_type, rule_category, evaluate_order,
                            enabled, calibration_status, rule_version, is_terminal, metric_id,
                            params_json, updated_at
                       FROM alert_rule`;

/** 规则列表（按判定顺序） */
export async function listRules(): Promise<RuleRow[]> {
  const rows = await query<AlertRuleDbRow>(`${SELECT_RULE} ORDER BY evaluate_order ASC, id ASC`);
  return rows.map(toRuleRow);
}

/**
 * 校验 params_json。
 *
 * 1) 必须是 JSON 对象（不是数组 / 标量）；
 * 2) 每个键必须是该规则在 rules.ts 中实际读取的键；
 * 3) 值必须是有限数值；整数键不接受小数；超出合理范围拒绝。
 *
 * 任一不满足抛 422（UNPROCESSABLE），message 说明「哪个键、为什么不允许、允许哪些键」。
 */
export function validateParamsJson(
  ruleCode: string,
  raw: unknown,
): Record<string, number> {
  if (raw === null || raw === undefined) return {};
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      throw AppError.unprocessable('阈值参数不是合法的 JSON 文本，请检查后重试。', {
        fields: { paramsJson: '不是合法的 JSON。' },
      });
    }
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw AppError.unprocessable('阈值参数必须是 JSON 对象（形如 { "键": 数值 }）。', {
      fields: { paramsJson: '必须是 JSON 对象，不能是数组或其它类型。' },
    });
  }

  const specs = RULE_PARAM_SPECS[ruleCode] ?? [];
  const specByKey = new Map(specs.map((spec) => [spec.key, spec]));
  const input = raw as Record<string, unknown>;
  const keys = Object.keys(input);

  const invalidKeys = keys.filter((key) => !specByKey.has(key));
  if (invalidKeys.length) {
    const details = invalidKeys.map((key) => {
      const hint = REJECTED_KEY_HINTS[key];
      return hint ? `「${key}」：${hint}` : `「${key}」：规则代码未读取该参数。`;
    });
    const allowedText = specs.length
      ? `规则 ${ruleCode} 允许的参数键：${specs.map((spec) => `${spec.key}（${spec.label}）`).join('、')}。`
      : `规则 ${ruleCode} 不读取任何阈值参数，params_json 必须为空对象 {}。`;
    throw AppError.unprocessable(
      `阈值参数包含规则 ${ruleCode} 未使用的键：${invalidKeys.join('、')}。${details.join(
        ' ',
      )} ${allowedText}阈值只能配置规则代码真正读取的键，否则会出现「改了参数但不生效」的假配置。`,
      {
        fields: { paramsJson: `不允许的参数键：${invalidKeys.join('、')}` },
        extra: { invalidKeys, allowedKeys: specs.map((spec) => spec.key) },
      },
    );
  }

  const values: Record<string, number> = {};
  const fieldErrors: Record<string, string> = {};
  for (const key of keys) {
    const spec = specByKey.get(key) as RuleParamSpec;
    const value = input[key];
    if (value === null || value === undefined || value === '') {
      // 空值视为「恢复默认」——直接省略该键，由 rules.ts 的 fallback 兜底
      continue;
    }
    const num = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(num)) {
      fieldErrors[key] = `「${spec.label}」必须是数值。`;
      continue;
    }
    if (spec.integer && !Number.isInteger(num)) {
      fieldErrors[key] = `「${spec.label}」必须是整数。`;
      continue;
    }
    if (spec.min !== undefined && num < spec.min) {
      fieldErrors[key] = `「${spec.label}」不能小于 ${spec.min}。`;
      continue;
    }
    if (spec.max !== undefined && num > spec.max) {
      fieldErrors[key] = `「${spec.label}」不能大于 ${spec.max}。`;
      continue;
    }
    values[key] = num;
  }

  if (Object.keys(fieldErrors).length) {
    throw AppError.unprocessable('阈值参数取值不合法。', {
      fields: { paramsJson: Object.values(fieldErrors).join(' ') },
      extra: { fieldErrors },
    });
  }

  return values;
}

export interface UpdateRuleInput {
  id: number;
  /** 显式传入的 code 必须与原值一致，否则 422（规则编码不可修改） */
  code?: string;
  name?: string;
  description?: string | null;
  evaluateOrder?: number;
  enabled?: boolean;
  paramsJson?: unknown;
  calibrationStatus?: CalibrationStatus;
}

/** 把 params_json 渲染成可读文本（审计 detail 用） */
function paramsText(params: Record<string, unknown>): string {
  const entries = Object.entries(params);
  if (!entries.length) return '{}';
  return `{${entries.map(([key, value]) => `${key}=${String(value)}`).join(', ')}}`;
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a === null || a === undefined) return b === null || b === undefined;
  return String(a) === String(b);
}

/**
 * 更新一条规则。只接受白名单字段；每次修改写审计并把「改前 → 改后」记入 detail。
 */
export async function updateRule(input: UpdateRuleInput, context: { userId: number; request?: Request }): Promise<RuleRow> {
  const before = await queryOne<AlertRuleDbRow>(`${SELECT_RULE} WHERE id = ?`, [input.id]);
  if (!before) throw AppError.notFound('预警规则不存在。');

  const ruleCode = String(before.code);
  const specs = RULE_PARAM_SPECS[ruleCode] ?? [];
  const allowedKeys = specs.map((spec) => spec.key);

  if (input.code !== undefined && input.code !== ruleCode) {
    throw AppError.unprocessable(
      `规则编码不可修改（当前为 ${ruleCode}）。规则编码是代码实现与数据库配置之间的契约键，` +
        '修改后引擎将找不到对应实现，规则会变成不生效的死配置。',
      { fields: { code: '规则编码不可修改。' } },
    );
  }

  const sets: string[] = [];
  const values: unknown[] = [];
  const changes: string[] = [];

  if (input.name !== undefined) {
    const name = String(input.name).trim();
    if (!name) throw AppError.validation('数据校验未通过。', { name: '规则名称不能为空。' });
    if (name.length > 128) {
      throw AppError.validation('数据校验未通过。', { name: '规则名称不能超过 128 个字符。' });
    }
    if (!sameValue(before.name, name)) {
      changes.push(`名称：${before.name} → ${name}`);
      sets.push('name = ?');
      values.push(name);
    }
  }

  if (input.description !== undefined) {
    const description =
      input.description === null || String(input.description).trim() === ''
        ? null
        : String(input.description).trim();
    if (description && description.length > 500) {
      throw AppError.validation('数据校验未通过。', {
        description: '规则说明不能超过 500 个字符。',
      });
    }
    if (!sameValue(before.description, description)) {
      changes.push(`说明：${before.description ?? '空'} → ${description ?? '空'}`);
      sets.push('description = ?');
      values.push(description);
    }
  }

  if (input.evaluateOrder !== undefined) {
    const order = Number(input.evaluateOrder);
    if (!Number.isInteger(order) || order < 1 || order > 99) {
      throw AppError.validation('数据校验未通过。', {
        evaluateOrder: '判定顺序必须是 1–99 的整数。',
      });
    }
    if (Number(before.evaluate_order) !== order) {
      changes.push(`判定顺序：${before.evaluate_order} → ${order}`);
      sets.push('evaluate_order = ?');
      values.push(order);
    }
  }

  if (input.enabled !== undefined) {
    const enabled = input.enabled ? 1 : 0;
    if (Number(before.enabled) !== enabled) {
      changes.push(`启用状态：${before.enabled ? '启用' : '停用'} → ${enabled ? '启用' : '停用'}`);
      sets.push('enabled = ?');
      values.push(enabled);
    }
  }

  if (input.calibrationStatus !== undefined) {
    const status = String(input.calibrationStatus);
    if (!['demo', 'pending_field_validation', 'validated'].includes(status)) {
      throw AppError.validation('数据校验未通过。', {
        calibrationStatus: '标定状态只能是 demo / pending_field_validation / validated。',
      });
    }
    if (String(before.calibration_status) !== status) {
      changes.push(`标定状态：${before.calibration_status} → ${status}`);
      sets.push('calibration_status = ?');
      values.push(status);
    }
  }

  let nextParams: Record<string, number> | null = null;
  if (input.paramsJson !== undefined) {
    // 校验放在服务层：非法键 / 非法值一律 422，并说明允许的键
    const next = validateParamsJson(ruleCode, input.paramsJson);
    nextParams = next;
    const current = parseParamsJson(before.params_json);
    const currentComparable: Record<string, unknown> = {};
    for (const key of allowedKeys) {
      if (current[key] !== undefined) currentComparable[key] = current[key];
    }
    const changed =
      JSON.stringify(next) !== JSON.stringify(currentComparable) ||
      Object.keys(current).some((key) => !allowedKeys.includes(key));
    if (changed) {
      changes.push(`阈值参数：${paramsText(current)} → ${paramsText(next)}`);
      sets.push('params_json = ?');
      values.push(JSON.stringify(next));
    }
  }

  if (!sets.length) {
    throw AppError.badRequest('没有需要更新的字段（提交值与当前值相同）。');
  }

  sets.push('updated_at = NOW()');
  await execute(`UPDATE alert_rule SET ${sets.join(', ')} WHERE id = ?`, [...values, input.id]);

  await writeAudit({
    user: { userId: context.userId },
    module: 'system',
    action: 'update',
    targetType: 'alert_rule',
    targetId: input.id,
    detail: `修改预警规则 ${ruleCode}（${before.name}）：${changes.join('；')}`,
    detailJson: {
      code: ruleCode,
      before: {
        name: before.name,
        description: before.description,
        evaluate_order: Number(before.evaluate_order),
        enabled: Number(before.enabled),
        calibration_status: before.calibration_status,
        params_json: parseParamsJson(before.params_json),
      },
      after: {
        name: input.name ?? before.name,
        description: input.description !== undefined ? input.description : before.description,
        evaluate_order: input.evaluateOrder ?? Number(before.evaluate_order),
        enabled: input.enabled !== undefined ? (input.enabled ? 1 : 0) : Number(before.enabled),
        calibration_status: input.calibrationStatus ?? before.calibration_status,
        params_json:
          nextParams ?? parseParamsJson(before.params_json),
      },
      changes,
    },
    request: context.request,
  });

  const updated = await queryOne<AlertRuleDbRow>(`${SELECT_RULE} WHERE id = ?`, [input.id]);
  if (!updated) throw AppError.notFound('修改成功但未能读回规则。');
  return toRuleRow(updated);
}
