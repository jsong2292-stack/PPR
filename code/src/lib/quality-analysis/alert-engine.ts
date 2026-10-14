/**
 * 预警判定引擎：把产品检验数据按产品规格的标准区间判成预警事件。
 *
 * 规则（同一条检验记录的同一个指标只产出一条事件，按严重程度从高到低匹配）：
 *   R3 超出标准区间          → 高风险
 *   R5 连续 3 点接近区间边界  → 中风险
 *   R0 落在标准区间内        → 正常
 *
 * 「接近」定义为实测值与边界距离不超过标准区间宽度的 15%（PROXIMITY_RATIO）：
 * 区间 2–10、宽度 8，接近带为 2–3.2 与 8.8–10，所以实测 3 或 9 都算接近。
 * 只有连续 3 个点落入接近带才算中风险；零散的接近点仍是正常，但事件文本会说明它已进入接近带。
 *
 * 标准区间一律取产品规格表 ppr_product_spec 的最大/最小外径、最大/最小壁厚和不圆度上限
 * （不圆度下限按 0 处理）；ppr_metric 已退化为纯指标字典，不参与判定。
 *
 * 引擎独占 R0/R3/R5 三个规则编码。每次重算先清理目标批次内的这些事件再重建，
 * 所以重复导入、重复扫描得到的结果完全一致，不会累积历史噪声。
 */
import { dbClient } from '@/lib/quality';
import { queueAlertPush, type AlertPushItem } from '@/lib/quality-analysis/wecom-notifier';
import type { TransactionClient } from '@/storage/database/mysql-client';

type Row = Record<string, unknown>;

export type AlertLevel = 'normal' | 'medium' | 'high';

/** 接近带宽度占标准区间宽度的比例。 */
export const PROXIMITY_RATIO = 0.15;
/** 接近带宽度相对区间宽度的百分数，仅用于事件文本。 */
const PROXIMITY_PERCENT = Math.round(PROXIMITY_RATIO * 100);
/** 触发中风险所需的连续接近点数。 */
export const PROXIMITY_RUN_LENGTH = 3;
/** 引擎独占的规则编码；不在这里的规则（如人工录入）不会被重算清理。 */
export const ENGINE_RULE_CODES = ['R0', 'R3', 'R5'] as const;

const RULE_NAMES: Record<(typeof ENGINE_RULE_CODES)[number], string> = {
  R3: '超出标准区间',
  R5: `连续${PROXIMITY_RUN_LENGTH}点接近区间边界`,
  R0: '在标准区间内',
};

type EngineRuleCode = keyof typeof RULE_NAMES;

const LEVEL_WEIGHT: Record<AlertLevel, number> = { normal: 0, medium: 1, high: 2 };

interface MetricDefinition {
  code: string;
  label: string;
  /** 事件编号里的指标后缀。 */
  suffix: string;
  valueColumn: string;
  /** 为 null 表示该指标只有上限（不圆度），下限按 0 处理。 */
  lowerColumn: string | null;
  upperColumn: string;
}

const METRICS: MetricDefinition[] = [
  { code: 'outer_diameter', label: '外径', suffix: 'OD', valueColumn: 'outer_diameter_mm', lowerColumn: 'outer_lower_mm', upperColumn: 'outer_upper_mm' },
  { code: 'min_wall_thickness', label: '壁厚', suffix: 'WT', valueColumn: 'min_wall_thickness_mm', lowerColumn: 'wall_lower_mm', upperColumn: 'wall_upper_mm' },
  { code: 'ovality', label: '不圆度', suffix: 'OV', valueColumn: 'ovality_mm', lowerColumn: null, upperColumn: 'ovality_upper_mm' },
];

/** 引擎负责判定的指标编码：只接管这些指标上的事件，其它指标的事件不动。 */
const ENGINE_METRIC_CODES = METRICS.map((metric) => metric.code);

/** 指标显示名，用于企微推送消息。 */
const METRIC_LABELS: Record<string, string> = Object.fromEntries(METRICS.map((metric) => [metric.code, metric.label]));

export interface AlertEvaluationSummary {
  /** 参与判定的批次数。 */
  batches: number;
  /** 参与判定的检验记录数。 */
  records: number;
  /** 重建后的事件总数。 */
  created: number;
  high: number;
  medium: number;
  normal: number;
}

/** 判定输入行：检验记录 + 所属规格的限值（导出供离线校验复用）。 */
export interface MeasurementRow extends Row {
  id: number;
  record_no: string;
  /** 批次号是唯一的批次关联键（字符串），分组与推送上下文都用它。 */
  batch_no: string;
  /** 规格名，仅用于企微推送消息的可读上下文。 */
  spec_name?: string;
  inspect_time: Date | string;
  quality_flag: string;
}

/** 判定产出的单条事件（导出供离线校验复用）。 */
export interface PlannedAlert {
  eventNo: string;
  measurementId: number;
  metricCode: string;
  riskLevel: AlertLevel;
  ruleCode: EngineRuleCode;
  ruleName: string;
  observedValue: number;
  thresholdText: string;
  detectedAt: Date | string;
}

/** 已存在的引擎事件；archived 表示它已被归档的 8D 报告引用，不能删除。 */
interface ExistingAlert {
  id: number;
  measurement_id: number;
  metric_code: string;
  status: string;
  archived: number;
  /** 已推送到企业微信的最高风险级别，NULL 表示从未推送。 */
  notified_level: string | null;
}

interface ResolvedRange {
  lower: number;
  upper: number;
  /** 接近带宽度（标准区间宽度 × PROXIMITY_RATIO）。 */
  band: number;
}

interface MeasuredPoint {
  row: MeasurementRow;
  value: number | null;
  range: ResolvedRange | null;
  /** 有实测值且规格上限齐全，才具备判定条件。 */
  judgeable: boolean;
  violation: boolean;
  proximate: boolean;
  /** 所在连续接近段的长度，非接近点为 0。 */
  runLength: number;
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function mm(value: number): string {
  return `${value.toFixed(3)} mm`;
}

/** 解析规格上的标准区间；缺上限或区间非法时返回 null，表示该指标不可判定。 */
function resolveRange(row: Row, metric: MetricDefinition): ResolvedRange | null {
  const upper = toNumber(row[metric.upperColumn]);
  if (upper === null) return null;
  const rawLower = metric.lowerColumn ? toNumber(row[metric.lowerColumn]) : 0;
  const lower = rawLower === null ? 0 : rawLower;
  if (upper <= lower) return null;
  return { lower, upper, band: (upper - lower) * PROXIMITY_RATIO };
}

function formatDay(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '00000000';
  // 连接层时区为 Z，DATETIME 的墙上时间按 UTC 读出，因此这里用 getUTC* 还原存储值。
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

/**
 * 事件编号按「检验日期 + 记录ID + 指标后缀」生成，完全由数据决定：
 * 同一条记录重复判定得到同一个编号，天然避免批量插入时的随机串碰撞。
 */
function buildEventNo(row: MeasurementRow, metric: MetricDefinition): string {
  return `QE-${formatDay(row.inspect_time)}-${String(row.id).padStart(3, '0')}${metric.suffix}`;
}

/** 检验时间按 UTC 墙上时间格式化为 yyyy-MM-dd HH:mm，用于企微推送消息。 */
function formatDateTime(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

/** 把已推送级别换算成可比较的权重；NULL 或未知值按「从未推送」处理。 */
function notifiedWeight(value: string | null): number {
  if (value === 'high' || value === 'medium') return LEVEL_WEIGHT[value];
  return -1;
}

/** 组装一条待推送事件。只有新产生或风险升级的中高风险事件会走到这里。 */
function buildPushItem(id: number, alert: PlannedAlert, row: MeasurementRow | undefined): AlertPushItem {
  return {
    id,
    eventNo: alert.eventNo,
    riskLevel: alert.riskLevel === 'high' ? 'high' : 'medium',
    metricLabel: METRIC_LABELS[alert.metricCode] ?? alert.metricCode,
    ruleName: alert.ruleName,
    observedValue: alert.observedValue,
    thresholdText: alert.thresholdText,
    recordNo: row?.record_no ?? '',
    batchNo: row?.batch_no ?? '',
    specName: row?.spec_name ?? '',
    inspectTime: row ? formatDateTime(row.inspect_time) : '',
  };
}

/**
 * 判定单个批次，返回该批次应重建的全部事件。
 * 导出供离线校验使用（scripts/demo-data/verify-alert-demo.js）：纯函数、无副作用，可单独验证规则。
 */
export function planBatch(batchRows: MeasurementRow[]): { alerts: PlannedAlert[]; levels: Map<number, AlertLevel> } {
  const alerts: PlannedAlert[] = [];
  const levels = new Map<number, AlertLevel>();

  const raise = (id: number, level: AlertLevel) => {
    const current = levels.get(id);
    if (!current || LEVEL_WEIGHT[level] > LEVEL_WEIGHT[current]) levels.set(id, level);
  };

  for (const metric of METRICS) {
    const series: MeasuredPoint[] = batchRows.map((row) => {
      const range = resolveRange(row, metric);
      const value = toNumber(row[metric.valueColumn]);
      const judgeable = value !== null && range !== null;
      const violation = judgeable && (value! < range!.lower || value! > range!.upper);
      const distance = judgeable ? Math.min(value! - range!.lower, range!.upper - value!) : null;
      return { row, value, range, judgeable, violation, proximate: judgeable && !violation && distance! <= range!.band, runLength: 0 };
    });
    if (!series.some((point) => point.judgeable)) continue;

    // 标出连续接近段：整段记录标记为中风险，事件只挂在段末，保证一个连续段一条事件。
    const runEnds = new Map<number, number>();
    for (let start = 0; start < series.length; ) {
      if (!series[start].proximate) { start += 1; continue; }
      let end = start;
      while (end + 1 < series.length && series[end + 1].proximate) end += 1;
      const length = end - start + 1;
      if (length >= PROXIMITY_RUN_LENGTH) {
        for (let index = start; index <= end; index += 1) series[index].runLength = length;
        for (let index = start; index <= end; index += 1) raise(series[index].row.id, 'medium');
        runEnds.set(end, start);
      }
      start = end + 1;
    }

    for (let index = 0; index < series.length; index += 1) {
      const { row, value, range, judgeable, violation, proximate } = series[index];
      if (!judgeable || value === null || range === null) continue;
      const base = {
        eventNo: buildEventNo(row, metric),
        measurementId: row.id,
        metricCode: metric.code,
        observedValue: value,
        detectedAt: row.inspect_time,
      };
      const interval = `${mm(range.lower)}–${mm(range.upper)}`;
      const nearLower = value - range.lower <= range.upper - value;

      if (violation) {
        const excess = nearLower ? range.lower - value : value - range.upper;
        alerts.push({
          ...base,
          riskLevel: 'high',
          ruleCode: 'R3',
          ruleName: RULE_NAMES.R3,
          thresholdText: `${interval}，实测 ${mm(value)}，${nearLower ? '低于下限' : '高于上限'} ${mm(excess)}`,
        });
        raise(row.id, 'high');
        continue;
      }

      const runStart = runEnds.get(index);
      if (runStart !== undefined) {
        const window = series.slice(runStart, index + 1);
        alerts.push({
          ...base,
          riskLevel: 'medium',
          ruleCode: 'R5',
          ruleName: RULE_NAMES.R5,
          thresholdText: `${interval}，连续 ${series[index].runLength} 点进入接近带（距${nearLower ? '下限' : '上限'} ≤ ${mm(range.band)}，为区间宽度的 ${PROXIMITY_PERCENT}%）：${window.map((point) => point.value!.toFixed(3)).join(' / ')}`,
        });
        raise(row.id, 'medium');
        continue;
      }

      alerts.push({
        ...base,
        riskLevel: 'normal',
        ruleCode: 'R0',
        ruleName: RULE_NAMES.R0,
        thresholdText: `${interval}，实测 ${mm(value)}，${proximate ? `已进入接近带但未连续 ${PROXIMITY_RUN_LENGTH} 点` : '未进入接近带'}`,
      });
      raise(row.id, 'normal');
    }
  }

  return { alerts, levels };
}

function emptySummary(): AlertEvaluationSummary {
  return { batches: 0, records: 0, created: 0, high: 0, medium: 0, normal: 0 };
}

/**
 * 重算预警事件。
 * 不传 batchNos 表示全量重算；传批次号数组只重算这些批次（导入、编辑、删除后按需触发）。
 */
export async function evaluateAlerts(options: { batchNos?: string[] } = {}): Promise<AlertEvaluationSummary> {
  const batchNos = options.batchNos?.map((no) => String(no)).filter((no) => no.length > 0);
  if (batchNos && batchNos.length === 0) return emptySummary();

  // 批次不再落表：批次号与生产班组直接取检验记录自身，规格限值按记录自己的 spec_id 关联。
  const where = batchNos && batchNos.length ? `WHERE m.batch_no IN (${batchNos.map(() => '?').join(',')})` : '';
  const rows = await dbClient.queryAll<MeasurementRow>(`SELECT m.id, m.record_no, m.batch_no, m.inspect_time, m.quality_flag,
    m.outer_diameter_mm, m.min_wall_thickness_mm, m.ovality_mm,
    s.name AS spec_name,
    s.outer_lower_mm, s.outer_upper_mm, s.wall_lower_mm, s.wall_upper_mm, s.ovality_upper_mm
    FROM ppr_product_measurement m
    JOIN ppr_product_spec s ON s.id = m.spec_id
    ${where}
    ORDER BY m.batch_no, m.inspect_time, m.id`, batchNos ?? []);
  if (!rows.length) return emptySummary();

  const grouped = new Map<string, MeasurementRow[]>();
  for (const row of rows) {
    const bucket = grouped.get(row.batch_no);
    if (bucket) bucket.push(row);
    else grouped.set(row.batch_no, [row]);
  }

  const alerts: PlannedAlert[] = [];
  const levels = new Map<number, AlertLevel>();
  for (const batchRows of grouped.values()) {
    const plan = planBatch(batchRows);
    alerts.push(...plan.alerts);
    for (const [id, level] of plan.levels) {
      const current = levels.get(id);
      if (!current || LEVEL_WEIGHT[level] > LEVEL_WEIGHT[current]) levels.set(id, level);
    }
  }

  const measurementIds = rows.map((row) => Number(row.id));
  const rowById = new Map(rows.map((row) => [Number(row.id), row]));
  /** 事务提交后要推送到企微的中高风险事件（推送状态在事务里读取，实际发送在提交后）。 */
  const pushItems: AlertPushItem[] = [];
  await dbClient.transaction(async (client: TransactionClient) => {
    const placeholders = measurementIds.map(() => '?').join(',');
    const metricPlaceholders = ENGINE_METRIC_CODES.map(() => '?').join(',');
    // 只看引擎自己产出的事件（source='engine'），并取出「是否已被归档 8D 报告引用」：
    // 归档链上的事件被外键 RESTRICT 保护，过期时只能关闭、不能删除。
    // notified_level 是企微推送去重状态：只有级别高于它的新异常才需要再推一次。
    const existingRows = await client.queryAll(`SELECT a.id, a.measurement_id, a.metric_code, a.status, a.notified_level,
      (SELECT COUNT(*) FROM ppr_analysis_run r
        JOIN ppr_eight_d_report d ON d.analysis_id = r.id
        JOIN ppr_history_archive h ON h.report_id = d.id
        WHERE r.alert_id = a.id) AS archived
      FROM ppr_alert_event a
      WHERE a.source = 'engine' AND a.measurement_id IN (${placeholders}) AND a.metric_code IN (${metricPlaceholders})`,
      [...measurementIds, ...ENGINE_METRIC_CODES]);
    const existing = existingRows as unknown as ExistingAlert[];

    const existingByKey = new Map(existing.map((row) => [`${row.measurement_id}:${row.metric_code}`, row]));
    const keptIds = new Set<number>();
    const inserts: PlannedAlert[] = [];
    /** 新增的中高风险事件：此刻还没有 id，INSERT 后回查再补成推送项。 */
    const newPushCandidates: PlannedAlert[] = [];

    for (const alert of alerts) {
      const current = existingByKey.get(`${alert.measurementId}:${alert.metricCode}`);
      const abnormal = alert.riskLevel !== 'normal';
      if (!current) {
        inserts.push(alert);
        if (abnormal) newPushCandidates.push(alert);
        continue;
      }
      keptIds.add(Number(current.id));
      // 原地更新而不是删了重建：事件ID 是诊断 / 8D 报告 / 历史归档的外键，必须保持稳定。
      // 已进入「分析中」的事件不因为重新扫描被打回「待分析」。
      const status = alert.riskLevel === 'normal' ? 'closed' : (current.status === 'analyzing' ? 'analyzing' : 'open');
      if (abnormal && LEVEL_WEIGHT[alert.riskLevel] > notifiedWeight(current.notified_level)) {
        pushItems.push(buildPushItem(Number(current.id), alert, rowById.get(alert.measurementId)));
      }
      // 事件回到正常时清空推送状态：同一记录以后再次异常要能重新告警。
      const resetNotify = alert.riskLevel === 'normal' ? ', notified_level=NULL, notified_at=NULL' : '';
      await client.query(
        `UPDATE ppr_alert_event SET event_no=?, risk_level=?, rule_code=?, rule_name=?,
          observed_value=?, threshold_text=?, status=?, detected_at=?${resetNotify} WHERE id=?`,
        [alert.eventNo, alert.riskLevel, alert.ruleCode, alert.ruleName, alert.observedValue, alert.thresholdText, status, alert.detectedAt, current.id]
      );
    }

    // 不再成立的历史事件：没有归档引用的直接删除，被归档报告引用的只能关闭，保住追溯链。
    const stale = existing.filter((row) => !keptIds.has(Number(row.id)));
    const deletable = stale.filter((row) => !Number(row.archived)).map((row) => Number(row.id));
    const closable = stale.filter((row) => Number(row.archived)).map((row) => Number(row.id));
    if (deletable.length) {
      await client.query(`DELETE FROM ppr_alert_event WHERE id IN (${deletable.map(() => '?').join(',')})`, deletable);
    }
    if (closable.length) {
      await client.query(
        `UPDATE ppr_alert_event SET status='closed', notified_level=NULL, notified_at=NULL, threshold_text=? WHERE id IN (${closable.map(() => '?').join(',')})`,
        ['该指标当前不可判定（实测值缺失或规格限值不完整），事件已关闭；已归档报告的追溯链保留', ...closable]
      );
    }

    if (inserts.length) {
      await client.query(
        `INSERT INTO ppr_alert_event
         (event_no, measurement_id, metric_code, risk_level, rule_code, rule_name, observed_value, threshold_text, status, source, detected_at)
         VALUES ${inserts.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ')}`,
        inserts.flatMap((alert) => [
          alert.eventNo,
          alert.measurementId,
          alert.metricCode,
          alert.riskLevel,
          alert.ruleCode,
          alert.ruleName,
          alert.observedValue,
          alert.thresholdText,
          // 正常记录无需处理，直接落成已关闭；异常记录进队列等待诊断。
          alert.riskLevel === 'normal' ? 'closed' : 'open',
          'engine',
          alert.detectedAt,
        ])
      );
      // 批量 INSERT 拿不到每条的自增ID，按 (measurement_id, metric_code) 回查一次，
      // 只取本次新增的那几条，用于推送成功后回写 notified_level。
      if (newPushCandidates.length) {
        const wantedKeys = new Set(newPushCandidates.map((alert) => `${alert.measurementId}:${alert.metricCode}`));
        const idRows = await client.queryAll(
          `SELECT id, measurement_id, metric_code FROM ppr_alert_event
           WHERE measurement_id IN (${placeholders}) AND metric_code IN (${metricPlaceholders})`,
          [...measurementIds, ...ENGINE_METRIC_CODES]
        ) as unknown as { id: number; measurement_id: number; metric_code: string }[];
        const idByKey = new Map(
          idRows
            .filter((row) => wantedKeys.has(`${row.measurement_id}:${row.metric_code}`))
            .map((row) => [`${row.measurement_id}:${row.metric_code}`, Number(row.id)])
        );
        for (const alert of newPushCandidates) {
          const id = idByKey.get(`${alert.measurementId}:${alert.metricCode}`);
          if (id) pushItems.push(buildPushItem(id, alert, rowById.get(alert.measurementId)));
        }
      }
    }
    // 质量标记跟随判定结果；error 是数据来源层面的错误标记，引擎不覆盖。
    for (const level of ['high', 'medium', 'normal'] as AlertLevel[]) {
      const ids = [...levels.entries()].filter(([, value]) => value === level).map(([id]) => id);
      if (!ids.length) continue;
      await client.query(
        `UPDATE ppr_product_measurement SET quality_flag=? WHERE quality_flag<>'error' AND id IN (${ids.map(() => '?').join(',')})`,
        [level, ...ids]
      );
    }
  });

  // 推送必须在事务提交之后入队：事务里的数据可能回滚，且外发请求不应占用数据库连接。
  // 入队本身不做网络请求，失败也不会影响判定结果——真正的发送由合并队列在后台完成。
  if (pushItems.length) {
    try {
      queueAlertPush(pushItems);
    } catch (cause) {
      console.error('[AlertEngine] 企微推送入队失败', cause);
    }
  }

  return {
    batches: grouped.size,
    records: rows.length,
    created: alerts.length,
    high: alerts.filter((alert) => alert.riskLevel === 'high').length,
    medium: alerts.filter((alert) => alert.riskLevel === 'medium').length,
    normal: alerts.filter((alert) => alert.riskLevel === 'normal').length,
  };
}

export type AlertRefreshTarget = {
  /** 只重算这些批次（批次号字符串）。 */
  batchNos?: string[];
  /** 重算该产品规格下的全部批次（规格限值被改动时使用）。 */
  specId?: number;
};

/**
 * 数据变更后的自动重算入口，导入 / 新增 / 编辑 / 删除产品数据以及修改规格限值都走这里。
 * 判定失败不应该中断数据写入本身，因此异常只记日志并返回 null，由调用方决定是否提示。
 */
export async function refreshAlertsQuietly(target: AlertRefreshTarget): Promise<AlertEvaluationSummary | null> {
  try {
    const batchNos = [...(target.batchNos ?? [])];
    if (target.specId) {
      // 批次不落表，规格下的批次号直接从检验记录里取。
      const batches = await dbClient.queryAll<{ batch_no: string }>(
        'SELECT DISTINCT batch_no FROM ppr_product_measurement WHERE spec_id=?', [target.specId]);
      batchNos.push(...batches.map((batch) => batch.batch_no));
    }
    const unique = [...new Set(batchNos.map((no) => String(no).trim()).filter((no) => no.length > 0))];
    if (!unique.length) return null;
    return await evaluateAlerts({ batchNos: unique });
  } catch (cause) {
    console.error('quality alert refresh failed', cause);
    return null;
  }
}
