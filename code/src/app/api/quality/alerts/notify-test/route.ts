import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { failFrom } from '@/lib/api';
import { flushAlertQueue, getWecomAlertConfig, maskWebhook, sendWecomTestPush } from '@/lib/quality-analysis/wecom-notifier';

export const runtime = 'nodejs';

/** 返回当前企微推送配置（Webhook 已掩码），供管理后台展示。 */
export async function GET() {
  try {
    await requireAdmin();
    const config = await getWecomAlertConfig();
    return NextResponse.json({
      enabled: config.enabled,
      minLevel: config.minLevel,
      configured: Boolean(config.webhook),
      webhook: maskWebhook(config.webhook),
      mentionList: config.mentionList,
      mentionAll: config.mentionAll,
    });
  } catch (error) {
    return failFrom(error, '读取推送配置失败');
  }
}

/**
 * 发送一条测试消息，验证 Webhook 是否可用。
 * Body 可带 { webhook } 用于「保存前先试打」；不传则用已保存配置。
 * 顺带 flush 一次待推送队列，方便管理员立即看到真实告警推送结果。
 */
export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
    const body = (await request.json().catch(() => ({}))) as { webhook?: unknown };
    const override = typeof body.webhook === 'string' ? body.webhook.trim() : '';
    const result = await sendWecomTestPush(override || undefined);
    const notify = await flushAlertQueue();
    if (!result.ok) {
      return NextResponse.json({ success: false, webhook: result.webhook, errcode: result.errcode, error: result.errmsg || '推送失败', notify }, { status: 502 });
    }
    return NextResponse.json({ success: true, webhook: result.webhook, notify });
  } catch (error) {
    return failFrom(error, '测试推送失败');
  }
}
