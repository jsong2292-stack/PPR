import { NextRequest, NextResponse } from 'next/server';
import { queryAll } from '@/storage/database/mysql-client';
import { requireAdmin } from '@/lib/auth';
import { failFrom } from '@/lib/api';
import { sendMessage, sendMessageToAdmins, sendMessageToUser } from '@/lib/message';

/**
 * 站内通知群发（仅管理员）
 *
 * Body:
 *   { target: 'all' | 'user', userId?, title, content, type?, relatedId?, relatedType? }
 */
export async function POST(request: NextRequest) {
  try {
    await requireAdmin();

    const { target = 'all', userId, title, content, type = 'system', relatedId, relatedType } =
      await request.json();

    if (!title || !content) {
      return NextResponse.json({ error: '请填写通知标题和内容' }, { status: 400 });
    }

    const payload = { title, content, type, relatedId, relatedType };

    if (target === 'user') {
      if (!userId) return NextResponse.json({ error: '请指定接收用户' }, { status: 400 });
      await sendMessageToUser(userId, payload);
      return NextResponse.json({ success: true, sent: 1 });
    }

    const users = await queryAll<{ id: string }>(
      "SELECT id FROM users WHERE status = 'active'"
    );

    for (const user of users) {
      await sendMessage({ ...payload, userId: user.id });
    }

    return NextResponse.json({ success: true, sent: users.length });
  } catch (error) {
    return failFrom(error);
  }
}

/**
 * 演示 / 自测：给当前登录用户自己发一条通知。
 * 业务代码里通常直接调用 src/lib/message.ts 的 sendMessage* 方法。
 */
export async function GET() {
  try {
    const admin = await requireAdmin();
    await sendMessage({
      userId: admin.id,
      type: 'system',
      title: '测试通知',
      content: `这是一条由 ${admin.nickname} 触发的测试通知，用于验证消息中心链路。`,
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return failFrom(error);
  }
}

/** 通知所有管理员（供其它业务模块内部调用时的 HTTP 形式示例） */
export async function PUT(request: NextRequest) {
  try {
    await requireAdmin();
    const { title, content } = await request.json();
    if (!title || !content) {
      return NextResponse.json({ error: '请填写通知标题和内容' }, { status: 400 });
    }
    await sendMessageToAdmins({ title, content, type: 'system' });
    return NextResponse.json({ success: true });
  } catch (error) {
    return failFrom(error);
  }
}
