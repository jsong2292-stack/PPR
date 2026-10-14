/**
 * 数据删除 / 清理的前端流程。
 *
 * 分两类，语义完全不同：
 *
 * 1. **主数据删除**（产品规格、设备、用户等）：`deleteQualityRecord` —— 先确认，再删；有关联数据时服务端拒绝。
 * 2. **按来源清理批次数据**：`cleanupBatchMeasurements` / `cleanupEquipmentBatchReadings`。
 *    批次不落表（`ppr_batch` 是按批次号聚合的视图），产品数据与设备数据之间也没有从属关系，
 *    所以清理必须分开：批次总览清的是「该批次的检验记录」，设备台账清的是「本设备该批次的采集数据」，
 *    谁也不连带谁。清理前先发一次**不带 confirm=1** 的探测请求（服务端此时一个字节都不删），
 *    拿到真实条数后弹一次确认框，确认后才带 `confirm=1` 真删 —— 用户看到的数字直接来自服务端。
 *
 * 确认框由调用方通过 `confirm` 传入（见 components/common/use-confirm-dialog.tsx），
 * 这样既不用 window.confirm，也不会把不可恢复的删除藏在一次点击里。
 *
 * 注意：批次号是字符串（不是自增主键），URL 参数会被自动编码。
 */
import type { ConfirmFn } from '@/components/common/use-confirm-dialog';

export type DeleteOutcome =
  | { status: 'deleted'; message?: string }
  | { status: 'cancelled' }
  | { status: 'failed'; error: string };

interface DeleteResponse {
  error?: string;
  code?: string;
  message?: string;
}

/** `confirmed=false` 时服务端只回报「会删掉什么」，不做任何删除。 */
async function sendDelete(url: string, confirmed: boolean): Promise<{ ok: boolean; status: number; json: DeleteResponse | null }> {
  const target = confirmed ? `${url}${url.includes('?') ? '&' : '?'}confirm=1` : url;
  const res = await fetch(target, { method: 'DELETE' });
  const json = (await res.json().catch(() => null)) as DeleteResponse | null;
  return { ok: res.ok, status: res.status, json };
}

/**
 * 主数据删除（立即生效）。
 * @param firstConfirm 首次确认内容：说明删的是哪条记录
 */
export async function deleteQualityRecord(
  confirm: ConfirmFn,
  resource: string,
  id: unknown,
  firstConfirm: { title: string; description?: string }
): Promise<DeleteOutcome> {
  const agreed = await confirm({ ...firstConfirm, confirmText: '删除', destructive: true });
  if (!agreed) return { status: 'cancelled' };

  const result = await sendDelete(`/api/quality/master/${resource}?id=${encodeURIComponent(String(id))}`, false);
  if (!result.ok) return { status: 'failed', error: result.json?.error || '删除失败' };
  return { status: 'deleted', message: result.json?.message };
}

/**
 * 按来源清理：先探测（不删任何数据）→ 用服务端给的条数弹一次确认 → 确认后清理。
 * @param code 服务端「还没确认」时返回的 409 code；其余 409（如归档保护）直接当失败报给用户
 */
export async function cleanupBySource(
  confirm: ConfirmFn,
  options: { url: string; code: string; title: string }
): Promise<DeleteOutcome> {
  const probe = await sendDelete(options.url, false);
  if (probe.status === 409 && probe.json?.code === options.code) {
    const agreed = await confirm({ title: options.title, description: probe.json.error, confirmText: '确认清理', destructive: true });
    if (!agreed) return { status: 'cancelled' };
    const done = await sendDelete(options.url, true);
    if (!done.ok) return { status: 'failed', error: done.json?.error || '清理失败' };
    return { status: 'deleted', message: done.json?.message };
  }
  if (!probe.ok) return { status: 'failed', error: probe.json?.error || '没有可清理的数据' };
  return { status: 'deleted', message: probe.json?.message };
}

/** 批次总览 / 规格下钻页：只清理该批次的检验记录（连带其预警事件），不碰设备采集数据。 */
export function cleanupBatchMeasurements(confirm: ConfirmFn, batchNo: string): Promise<DeleteOutcome> {
  return cleanupBySource(confirm, {
    url: `/api/quality/master/batches?id=${encodeURIComponent(batchNo)}`,
    code: 'BATCH_HAS_MEASUREMENTS',
    title: '清理本批检验记录',
  });
}

/** 设备台账批次页：只清理本设备在该批次下的采集数据，不碰产品数据与其他设备。 */
export function cleanupEquipmentBatchReadings(confirm: ConfirmFn, equipmentId: number, batchNo: string): Promise<DeleteOutcome> {
  return cleanupBySource(confirm, {
    url: `/api/quality/equipment/${equipmentId}/batches/${encodeURIComponent(batchNo)}/readings`,
    code: 'READINGS_HAS_ROWS',
    title: '清理本设备该批次的采集数据',
  });
}
