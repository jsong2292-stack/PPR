import { z } from 'zod';
import { withApi, ok } from '@/lib/api';
import { AppError } from '@/lib/errors';
import { flattenZod, safeJson } from '@/lib/route-helpers';
import {
  CALIBRATION_OPTIONS,
  RULE_PARAM_SPECS,
  listRules,
  updateRule,
} from '@/lib/services/ruleAdminService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 预警规则管理接口。
 *
 * GET  /api/system/rules —— 规则列表（R1–R5，按判定顺序），
 *      同时返回每个规则**允许配置的阈值参数键**及其含义/单位（paramSpecs），
 *      页面据此渲染键值表并把非法键挡在提交之前。
 *
 * PUT  /api/system/rules —— 更新一条规则，请求体：
 *        {
 *          id: number,                                  // 必填
 *          code?: string,                               // 只允许与原值相同（不可改）
 *          name?, description?, evaluateOrder?,
 *          enabled?: boolean,
 *          paramsJson?: { [key: string]: number },      // 只允许规则实际读取的键
 *          calibrationStatus?: 'demo'|'pending_field_validation'|'validated'
 *        }
 *
 *      阈值键白名单（来自 src/lib/analysis/rules.ts 的 numericParam 调用核对）：
 *        R1 / R2 / R3 / R5：不读取任何 params_json 键（必须为 {}）
 *        R4：maximum_window_hours（趋势比较窗口，小时）、
 *            consecutive（连续可比较点数，个）、
 *            minimum_change_mm（趋势最小变化量，mm）、
 *            maximum_gap_minutes（相邻点最大间隔，分钟）
 *      出现白名单以外的键（例如 maximum_window_hours、tolerance_mm）返回 422，
 *      message 会说明该键为什么不被读取。
 */
export const GET = withApi(
  { name: 'GET /api/system/rules', permission: 'system:read' },
  async () =>
    ok({
      rows: await listRules(),
      paramSpecs: RULE_PARAM_SPECS,
      calibrationOptions: CALIBRATION_OPTIONS,
    }),
);

const updateSchema = z.object({
  id: z.coerce.number().int().positive(),
  code: z.string().trim().max(32).optional(),
  name: z.string().trim().min(1).max(128).optional(),
  // 允许 null 表示「清空说明」；'' 由服务层归一成 null
  description: z.union([z.string(), z.null()]).optional(),
  evaluateOrder: z.coerce.number().int().min(1).max(99).optional(),
  enabled: z.boolean().optional(),
  // 阈值结构由服务层做「键白名单 + 数值范围」校验，出错时抛出带说明的 422
  paramsJson: z.unknown().optional(),
  calibrationStatus: z.enum(['demo', 'pending_field_validation', 'validated']).optional(),
});

export const PUT = withApi(
  { name: 'PUT /api/system/rules', permission: 'system:write' },
  async ({ request, user }) => {
    const body = await safeJson(request);
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      throw AppError.validation('请求参数校验未通过。', flattenZod(parsed.error));
    }
    const rule = await updateRule(parsed.data, { userId: user!.userId, request });
    return ok({ rule });
  },
);
