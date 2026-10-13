import { NextResponse } from 'next/server';
import { evaluateAlerts } from '@/lib/quality-analysis/alert-engine';
import { getCurrentUser } from '@/lib/auth';

export const runtime = 'nodejs';

/**
 * 全量重算预警事件。
 * 判定逻辑见 src/lib/quality-analysis/alert-engine.ts：
 * 超出产品规格标准区间 → 高风险，连续 3 点接近区间边界 → 中风险，其余 → 正常。
 */
export async function POST() {
  if (!(await getCurrentUser())) return NextResponse.json({ error: '请先登录' }, { status: 401 });
  try {
    const summary = await evaluateAlerts();
    return NextResponse.json({ success: true, ...summary });
  } catch (cause) {
    console.error('quality alert evaluation failed', cause);
    return NextResponse.json({ error: cause instanceof Error ? cause.message : '扫描失败' }, { status: 500 });
  }
}
