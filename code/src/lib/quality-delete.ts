/**
 * 主数据删除的前端流程（批次清理共用：产品台账 → 批次、设备台账 → 批次）。
 *
 * 批次不落表，「删除批次」= 把该批次号下的检验记录与采集数据一并清掉（见 lib/quality-batch-delete.ts）。
 * 服务端在批次下挂有数据时返回 409 + `code: 'BATCH_HAS_DEPENDENTS'`，
 * 这里负责把「会连带删掉哪些数据」摆到用户面前做二次确认，确认后才带 `cascade=1` 重试。
 * 确认框由调用方通过 `confirm` 传入（见 components/common/use-confirm-dialog.tsx），
 * 这样既不用 window.confirm，也不会把不可恢复的级联删除藏在一次点击里。
 *
 * 注意：批次号是字符串（不是自增主键），URL 参数会被自动编码。
 */
import type { ConfirmFn } from '@/components/common/use-confirm-dialog';

export type DeleteOutcome =
  | { status: 'deleted' }
  | { status: 'cancelled' }
  | { status: 'failed'; error: string };

interface DeleteResponse {
  error?: string;
  code?: string;
}

async function sendDelete(resource: string, id: unknown, cascade: boolean) {
  const query = new URLSearchParams({ id: String(id) });
  if (cascade) query.set('cascade', '1');
  const res = await fetch(`/api/quality/master/${resource}?${query.toString()}`, { method: 'DELETE' });
  const json = (await res.json().catch(() => null)) as DeleteResponse | null;
  return { res, json };
}

/**
 * @param confirm 确认弹窗函数（useConfirmDialog 提供）
 * @param firstConfirm 首次确认内容：说明删的是哪条记录
 * @returns deleted=已删除；cancelled=用户取消；failed=服务端拒绝或出错（error 为中文原因）
 */
export async function deleteQualityRecord(
  confirm: ConfirmFn,
  resource: string,
  id: unknown,
  firstConfirm: { title: string; description?: string }
): Promise<DeleteOutcome> {
  const agreed = await confirm({ ...firstConfirm, confirmText: '删除', destructive: true });
  if (!agreed) return { status: 'cancelled' };

  const first = await sendDelete(resource, id, false);
  if (first.res.status === 409 && first.json?.code === 'BATCH_HAS_DEPENDENTS') {
    const again = await confirm({
      title: '该批次下还有关联数据',
      description: `${first.json.error ?? ''}\n\n确认连同以上数据一并删除？`,
      confirmText: '一并删除',
      destructive: true,
    });
    if (!again) return { status: 'cancelled' };
    const second = await sendDelete(resource, id, true);
    if (!second.res.ok) return { status: 'failed', error: second.json?.error || '删除失败' };
    return { status: 'deleted' };
  }
  if (!first.res.ok) return { status: 'failed', error: first.json?.error || '删除失败' };
  return { status: 'deleted' };
}
