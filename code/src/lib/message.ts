/**
 * 站内消息通知辅助模块
 *
 * 业务代码中直接调用 sendMessage / sendMessageToUser / sendMessageToAdmins
 * 即可写入一条站内通知，前端 Navbar 每 60s 轮询未读数。
 */
import { query, queryAll } from '@/storage/database/mysql-client';

/** 消息类型（可按业务扩展） */
export type MessageType =
  | 'system'
  | 'audit'
  | 'comment'
  | 'like'
  | 'collect'
  | 'follow';

/** 关联业务类型（可按业务扩展） */
export type RelatedType = string | null;

export interface SendMessageParams {
  /** 接收消息的用户 ID */
  userId: string;
  type: MessageType;
  title: string;
  content: string;
  /** 关联业务记录 ID */
  relatedId?: number;
  /** 关联业务类型，用于前端跳转 */
  relatedType?: RelatedType;
}

/** 向指定用户发送一条站内通知 */
export async function sendMessage(params: SendMessageParams): Promise<void> {
  const { userId, type, title, content, relatedId, relatedType } = params;

  try {
    await query(
      `INSERT INTO messages (user_id, type, title, content, related_id, related_type, is_read, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, false, NOW())`,
      [userId, type, title, content, relatedId ?? null, relatedType ?? null]
    );
  } catch (error) {
    console.error('[Message] sendMessage 失败:', { userId, type, title }, error);
    throw error;
  }
}

/** sendMessage 的语义化别名 */
export async function sendMessageToUser(
  userId: string,
  params: Omit<SendMessageParams, 'userId'>
): Promise<void> {
  await sendMessage({ ...params, userId });
}

/** 向所有管理员群发通知（用于新提交待审核等场景） */
export async function sendMessageToAdmins(
  params: Omit<SendMessageParams, 'userId'>
): Promise<void> {
  const admins = await queryAll<{ id: string }>(
    `SELECT id FROM users WHERE role = 'admin' AND status = 'active'`
  );

  if (admins.length === 0) {
    console.warn('[Message] sendMessageToAdmins: 未找到管理员用户');
    return;
  }

  for (const admin of admins) {
    await sendMessage({ ...params, userId: admin.id });
  }
}
