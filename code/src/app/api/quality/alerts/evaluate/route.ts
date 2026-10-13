import { NextResponse } from 'next/server';
import { evaluateAlerts } from '@/lib/quality-analysis/alert-engine';
import { flushAlertQueue } from '@/lib/quality-analysis/wecom-notifier';
import { getCurrentUser } from '@/lib/auth';

export const runtime = 'nodejs';

/**
 * 全量重算预警事件。
 * 判定逻辑见 src/lib/quality-analysis/alert-engine.ts：
 * 超出产品规格标准区间 → 高风险，连续 3 点接近区间边界 → 中风险，其余 → 正常。
 *
 * 判定出的中/高风险事件会推送到企业微信机器人；日常推送在合并窗口（5 秒）后异步发出，
 * 手工扫描属于人工操作，这里立即 flush，把本次推送结果一并返回给调用方。
 */
export async function POST() {
  if (!(await getCurrentUser())) return NextResponse.json({ error: '请先登录' }, { status: 401 });
  try {
    const summary = await evaluateAlerts();
    const notify = await flushAlertQueue();
    return NextResponse.json({ success: true, ...summary, notify });
  } catch (cause) {
    console.error('quality alert evaluation failed', cause);
    return NextResponse.json({ error: cause instanceof Error ? cause.message : '扫描失败' }, { status: 500 });
  }
}
