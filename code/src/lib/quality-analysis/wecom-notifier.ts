/**
 * PPR 质量预警的企业微信群机器人推送。
 *
 * 调用链：预警判定引擎（alert-engine.ts）产出中/高风险事件 → queueAlertPush() 入队
 * → 合并窗口到期后 flushAlertQueue() 把窗口内的全部异常组装成一条 markdown 消息发给机器人。
 *
 * 三个关键设计：
 *  1. **合并发送**：判定引擎每保存一行数据就会重算一次，逐次直发会刷屏并撞上群机器人
 *     20 条/分钟的限流。窗口内的多条异常合并成一条消息（PUSH_COALESCE_MS）。
 *  2. **去重靠数据库状态**：只有判定引擎判定为「新产生」或「风险升级」的事件才会入队
 *     （见 alert-engine.ts），推送成功后才回写 ppr_alert_event.notified_level / notified_at，
 *     因此重复导入同一批数据不会重复告警，推送失败也会在下一次重算时自动重试。
 *  3. **失败静默**：推送异常只写服务端日志，绝不向调用方抛错——预警算不出来或推不出去
 *     都不应该影响业务数据写入。
 *
 * 配置读取优先级：system_config（管理后台可改）→ 环境变量（部署级兜底）。
 * Webhook 地址含密钥，接口与日志里一律做掩码处理。
 */
import { query } from '@/storage/database/mysql-client';
import { getConfigFlag, getConfigValue } from '@/lib/system-config';
import { envFlag } from '@/lib/env';

/** 推送风险级别：引擎只推送中风险和高风险。 */
export type PushLevel = 'medium' | 'high';

const LEVEL_WEIGHT: Record<PushLevel, number> = { medium: 1, high: 2 };

/** 合并窗口：首次入队后固定等待该时长再发送，导入风暴下不会被不断推迟。 */
export const PUSH_COALESCE_MS = 5000;
/** 单次 HTTP 请求超时。 */
const PUSH_TIMEOUT_MS = 8000;
/** 每个风险级别最多在消息里展开的条数，其余折叠成一行提示。 */
const MAX_ITEMS_PER_LEVEL = 8;
/** markdown 内容上限 4096 字节，留出余量后按字节截断。 */
const MAX_CONTENT_BYTES = 3800;

/** 一条待推送的预警事件（由判定引擎组装）。 */
export interface AlertPushItem {
  /** ppr_alert_event.id，推送成功后按它回写推送状态。 */
  id: number;
  eventNo: string;
  riskLevel: PushLevel;
  /** 指标显示名，如「壁厚」。 */
  metricLabel: string;
  /** 规则名，如「超出标准区间」。 */
  ruleName: string;
  observedValue: number | null;
  /** 判定引擎生成的阈值说明文本。 */
  thresholdText: string | null;
  recordNo: string;
  batchNo: string;
  specName: string;
  /** 检验时间，已按 UTC 墙上时间格式化。 */
  inspectTime: string;
}

export interface WecomAlertConfig {
  enabled: boolean;
  webhook: string;
  minLevel: PushLevel;
  /** 需要在推送里 @ 的成员 userid 列表。 */
  mentionList: string[];
  /** 是否额外 @所有人。 */
  mentionAll: boolean;
}

export interface WecomSendResult {
  ok: boolean;
  errcode?: number;
  errmsg?: string;
}

/** 一次 flush 的结果，用于接口响应与日志。 */
export interface AlertFlushResult {
  /** 本次出队的事件数。 */
  queued: number;
  /** 实际写进消息的事件数。 */
  pushed: number;
  sent: boolean;
  skipped?: 'empty' | 'disabled' | 'below-min-level';
  error?: string;
}

function normalizeLevel(value: string | null | undefined, fallback: PushLevel): PushLevel {
  return value === 'high' || value === 'medium' ? value : fallback;
}

/** 单个消息里最多 @ 的成员数，避免配置写错时把消息撑爆。 */
const MAX_MENTION_COUNT = 20;

/**
 * 解析 @成员 的 userid 列表：支持逗号、中文逗号、分号、空白分隔。
 * userid 只保留企业微信允许的字符，顺便剥掉可能被当成标记注入的尖括号和 @。
 */
export function parseMentionList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const ids = raw
    .split(/[,，;；\s]+/)
    .map((id) => id.replace(/[<>@]/g, '').trim())
    .filter((id) => id.length > 0 && id.length <= 64)
    .filter((id) => /^[A-Za-z0-9._-]+$/.test(id));
  return [...new Set(ids)].slice(0, MAX_MENTION_COUNT);
}

/** 读取推送配置：system_config 优先，环境变量兜底，默认关闭。 */
export async function getWecomAlertConfig(): Promise<WecomAlertConfig> {
  const [enabled, webhook, minLevel, mentionList, mentionAll] = await Promise.all([
    getConfigFlag('wecom_alert_enabled', envFlag('WECOM_ALERT_ENABLED')),
    getConfigValue('wecom_alert_webhook'),
    getConfigValue('wecom_alert_min_level'),
    getConfigValue('wecom_alert_mention_list'),
    getConfigValue('wecom_alert_mention_all'),
  ]);
  return {
    enabled,
    webhook: (webhook || process.env.WECOM_ALERT_WEBHOOK || '').trim(),
    minLevel: normalizeLevel(minLevel || process.env.WECOM_ALERT_MIN_LEVEL, 'medium'),
    mentionList: parseMentionList(mentionList || process.env.WECOM_ALERT_MENTION_LIST),
    mentionAll: mentionAll === null ? envFlag('WECOM_ALERT_MENTION_ALL') : mentionAll === 'true',
  };
}

/**
 * 拼 @ 提醒。企业微信「消息推送」的 markdown / text 类型支持在 content 里用 <@userid> 语法 @群成员
 * （markdown_v2 不支持），@所有人用 <@all>。
 */
export function buildMentionLine(config: Pick<WecomAlertConfig, 'mentionList' | 'mentionAll'>): string {
  const parts: string[] = [];
  if (config.mentionAll) parts.push('<@all>');
  for (const id of config.mentionList) parts.push(`<@${id}>`);
  return parts.length ? `> 请关注：${parts.join(' ')}` : '';
}

/** Webhook 只做最低限度的形状校验：必须是 http(s) 地址且带 key 参数。 */
export function isValidWebhook(webhook: string): boolean {
  if (!/^https?:\/\/\S+$/i.test(webhook)) return false;
  try {
    const url = new URL(webhook);
    return Boolean(url.searchParams.get('key'));
  } catch {
    return false;
  }
}

/** 掩码处理，避免密钥出现在接口响应或日志里。 */
export function maskWebhook(webhook: string): string {
  if (!webhook) return '';
  return webhook.replace(/([?&]key=)([^&]+)/i, (_match, prefix: string, key: string) => {
    const tail = key.length > 4 ? key.slice(-4) : '';
    return `${prefix}****${tail}`;
  });
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** 与事件编号一致，按 UTC 墙上时间格式化（连接层时区为 Z）。 */
function formatDateTime(value: Date): string {
  return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())} ${pad(value.getUTCHours())}:${pad(value.getUTCMinutes())}`;
}

/** 按 UTF-8 字节数截断，避免超出 markdown 4096 字节上限被机器人拒绝。 */
function clampBytes(content: string, maxBytes: number): string {
  if (Buffer.byteLength(content, 'utf8') <= maxBytes) return content;
  const suffix = '\n> 内容过长已截断，完整清单见预警事件队列';
  let truncated = content;
  while (truncated.length > 0 && Buffer.byteLength(truncated + suffix, 'utf8') > maxBytes) {
    truncated = truncated.slice(0, -64);
  }
  return truncated + suffix;
}

function formatItem(item: AlertPushItem): string[] {
  const lines = [`**${item.eventNo}**　${item.metricLabel}　${item.ruleName}`];
  const context = [item.batchNo ? `批次 ${item.batchNo}` : '', item.specName, item.inspectTime].filter(Boolean).join('　');
  if (context) lines.push(`> ${context}`);
  const detail = item.thresholdText || `实测 ${item.observedValue ?? '-'}`;
  lines.push(`> ${detail}`);
  if (item.recordNo) lines.push(`> 检验记录 ${item.recordNo}`);
  return lines;
}

/** 组装一条 markdown 消息：高风险在前，同级按入队顺序；配置了 @ 时在最上方插一行提醒。 */
export function buildAlertMarkdown(
  items: AlertPushItem[],
  options: { mentionList?: string[]; mentionAll?: boolean; now?: Date } = {}
): string {
  const highs = items.filter((item) => item.riskLevel === 'high');
  const mediums = items.filter((item) => item.riskLevel === 'medium');
  const lines: string[] = [
    '# PPR 质量预警',
    `> 识别时间：${formatDateTime(options.now ?? new Date())}　高风险 <font color="warning">${highs.length}</font> 条　中风险 <font color="comment">${mediums.length}</font> 条`,
  ];
  const mentionLine = buildMentionLine({ mentionList: options.mentionList ?? [], mentionAll: options.mentionAll ?? false });
  if (mentionLine) lines.push(mentionLine);

  for (const [title, color, list] of [
    ['高风险', 'warning', highs],
    ['中风险', 'comment', mediums],
  ] as const) {
    if (!list.length) continue;
    lines.push(`## <font color="${color}">${title}（${list.length}）</font>`);
    for (const item of list.slice(0, MAX_ITEMS_PER_LEVEL)) lines.push(...formatItem(item));
    if (list.length > MAX_ITEMS_PER_LEVEL) {
      lines.push(`> 其余 ${list.length - MAX_ITEMS_PER_LEVEL} 条未展开，请到预警事件队列处理`);
    }
  }

  return clampBytes(lines.join('\n'), MAX_CONTENT_BYTES);
}

/** 调用群机器人 Webhook 发送 markdown 消息。 */
export async function sendWecomMarkdown(webhook: string, content: string): Promise<WecomSendResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PUSH_TIMEOUT_MS);
  try {
    const response = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ msgtype: 'markdown', markdown: { content } }),
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) return { ok: false, errmsg: `HTTP ${response.status}：${text.slice(0, 200)}` };
    let payload: { errcode?: number; errmsg?: string };
    try {
      payload = JSON.parse(text) as { errcode?: number; errmsg?: string };
    } catch {
      return { ok: false, errmsg: `响应不是合法 JSON：${text.slice(0, 200)}` };
    }
    const errcode = payload.errcode ?? -1;
    return errcode === 0
      ? { ok: true, errcode, errmsg: payload.errmsg }
      : { ok: false, errcode, errmsg: payload.errmsg ?? '机器人返回未知错误' };
  } catch (cause) {
    return { ok: false, errmsg: cause instanceof Error ? cause.message : '请求机器人失败' };
  } finally {
    clearTimeout(timer);
  }
}

/** 管理后台「发送测试消息」用；webhookOverride 允许在保存前先试打。 */
export async function sendWecomTestPush(webhookOverride?: string): Promise<{ ok: boolean; webhook: string; errcode?: number; errmsg?: string }> {
  const config = await getWecomAlertConfig();
  const webhook = (webhookOverride ?? config.webhook).trim();
  if (!isValidWebhook(webhook)) {
    return { ok: false, webhook: maskWebhook(webhook), errmsg: 'Webhook 地址无效，需形如 https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxx' };
  }
  const content = [
    '# PPR 质量预警推送测试',
    '> 收到本消息说明企微「消息推送」配置可用；中/高风险预警将按此格式推送。',
    `> 发送时间：${formatDateTime(new Date())}`,
    buildMentionLine(config),
  ].filter(Boolean).join('\n');
  const result = await sendWecomMarkdown(webhook, content);
  return { ...result, webhook: maskWebhook(webhook) };
}

/** 同一事件可能被多次重算命中，入队时按 id 去重并保留更高风险级别。 */
const pending = new Map<number, AlertPushItem>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let flushing: Promise<AlertFlushResult> | null = null;

/** 判定引擎调用：把新增/升级的中高风险事件放入合并队列，立即返回、绝不抛错。 */
export function queueAlertPush(items: AlertPushItem[]): void {
  if (!items.length) return;
  for (const item of items) {
    const current = pending.get(item.id);
    if (!current || LEVEL_WEIGHT[item.riskLevel] > LEVEL_WEIGHT[current.riskLevel]) pending.set(item.id, item);
  }
  // 只保留一个定时器：合并窗口从「首次入队」开始算，持续导入不会被无限推迟。
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushAlertQueue();
  }, PUSH_COALESCE_MS);
  flushTimer.unref?.();
}

/** 立即发送队列内容；并发调用会串行化，保证入队的事件都被发出去。 */
export async function flushAlertQueue(): Promise<AlertFlushResult> {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  // 等待前一次发送结束，避免同一批事件被打包两次或漏发。
  while (flushing) await flushing;
  if (!pending.size) return { queued: 0, pushed: 0, sent: false, skipped: 'empty' };
  flushing = runFlush();
  try {
    return await flushing;
  } finally {
    flushing = null;
  }
}

async function runFlush(): Promise<AlertFlushResult> {
  const items = [...pending.values()];
  pending.clear();
  const config = await getWecomAlertConfig();
  if (!config.enabled || !isValidWebhook(config.webhook)) {
    return { queued: items.length, pushed: 0, sent: false, skipped: 'disabled' };
  }

  const target = items.filter((item) => LEVEL_WEIGHT[item.riskLevel] >= LEVEL_WEIGHT[config.minLevel]);
  if (!target.length) return { queued: items.length, pushed: 0, sent: false, skipped: 'below-min-level' };

  const result = await sendWecomMarkdown(config.webhook, buildAlertMarkdown(target, {
    mentionList: config.mentionList,
    mentionAll: config.mentionAll,
  }));
  if (!result.ok) {
    console.error('[WecomAlert] 推送失败', result.errcode, result.errmsg);
    // 不写推送状态：下一次重算会重新识别为「未推送」并重试。
    return { queued: items.length, pushed: 0, sent: false, error: result.errmsg || '推送失败' };
  }

  await markNotified(target);
  return { queued: items.length, pushed: target.length, sent: true };
}

/** 推送成功后回写 notified_level / notified_at，用于后续重算去重。 */
async function markNotified(items: AlertPushItem[]): Promise<void> {
  try {
    for (const level of ['high', 'medium'] as PushLevel[]) {
      const ids = items.filter((item) => item.riskLevel === level).map((item) => item.id);
      if (!ids.length) continue;
      await query(
        `UPDATE ppr_alert_event SET notified_level=?, notified_at=NOW() WHERE id IN (${ids.map(() => '?').join(',')})`,
        [level, ...ids]
      );
    }
  } catch (cause) {
    // 回写失败会导致下次重算重复推送一次，但不会影响数据正确性。
    console.error('[WecomAlert] 写入推送状态失败', cause);
  }
}
