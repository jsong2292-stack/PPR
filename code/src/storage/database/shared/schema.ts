/**
 * 表结构类型定义（drizzle-orm，仅用于 TypeScript 类型参考，运行时统一使用原生 SQL）
 *
 * 新项目扩展方式：
 *   1. 在此处新增 mysqlTable 定义并导出 InferSelectModel 类型
 *   2. 在 scripts/init-db.sql 与 scripts/migrations/ 中维护对应的 DDL
 *
 * 注意：`users.id` 为 VARCHAR(36)（UUID），由应用层生成，不使用自增主键。
 */
import {
  mysqlTable,
  int,
  varchar,
  text,
  timestamp,
  boolean,
  bigint,
  index,
  unique,
  foreignKey,
} from 'drizzle-orm/mysql-core';
import { InferSelectModel, InferInsertModel } from 'drizzle-orm';

// ============================================================
// 系统
// ============================================================

export const healthCheck = mysqlTable('health_check', {
  id: int().autoincrement().primaryKey().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'string' }).defaultNow(),
});

/** 系统配置：key-value 形式的全局开关与参数 */
export const systemConfig = mysqlTable(
  'system_config',
  {
    id: int().autoincrement().primaryKey().notNull(),
    key: varchar({ length: 100 }).notNull(),
    value: text().notNull(),
    description: text(),
    createdAt: timestamp('created_at', { mode: 'string' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'string' }),
  },
  (table) => [
    index('system_config_key_idx').on(table.key),
    unique('system_config_key_key').on(table.key),
  ]
);

// ============================================================
// 用户
// ============================================================

export const users = mysqlTable(
  'users',
  {
    /** UUID，由应用层生成 */
    id: varchar({ length: 36 }).primaryKey().notNull(),
    /** 登录账号（本地账号体系里等同于用户名） */
    phone: varchar({ length: 64 }),
    email: varchar({ length: 255 }),
    nickname: varchar({ length: 100 }).notNull(),
    avatar: text(),
    password: text(),
    /** 岗位 / 部门 */
    industry: varchar({ length: 100 }),
    /** 专长 / 标签 */
    expertise: text(),
    bio: text(),
    role: varchar({ length: 20 }).default('user').notNull(),
    status: varchar({ length: 20 }).default('active').notNull(),
    /** 单点登录返回的外部用户标识 */
    externalId: varchar('external_id', { length: 128 }),
    /** 认证来源：local / sso */
    authProvider: varchar('auth_provider', { length: 20 }).default('local'),
    loginFailCount: int('login_fail_count').default(0),
    frozenUntil: timestamp('frozen_until', { mode: 'string' }),
    lastLoginAt: timestamp('last_login_at', { mode: 'string' }),
    createdAt: timestamp('created_at', { mode: 'string' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'string' }),
  },
  (table) => [
    index('users_email_idx').on(table.email),
    index('users_phone_idx').on(table.phone),
    index('users_external_id_idx').on(table.externalId),
    unique('users_phone_key').on(table.phone),
    unique('users_email_key').on(table.email),
  ]
);

/** 关注关系 */
export const follows = mysqlTable(
  'follows',
  {
    id: int().autoincrement().primaryKey().notNull(),
    followerId: varchar('follower_id', { length: 36 }).notNull(),
    followingId: varchar('following_id', { length: 36 }).notNull(),
    createdAt: timestamp('created_at', { mode: 'string' }).defaultNow().notNull(),
  },
  (table) => [
    index('follows_follower_id_idx').on(table.followerId),
    index('follows_following_id_idx').on(table.followingId),
    foreignKey({
      columns: [table.followerId],
      foreignColumns: [users.id],
      name: 'follows_follower_id_fkey',
    }),
    foreignKey({
      columns: [table.followingId],
      foreignColumns: [users.id],
      name: 'follows_following_id_fkey',
    }),
    unique('follows_follower_id_following_id_key').on(table.followerId, table.followingId),
  ]
);

// ============================================================
// 消息
// ============================================================

/** 站内通知 */
export const messages = mysqlTable(
  'messages',
  {
    id: int().autoincrement().primaryKey().notNull(),
    userId: varchar('user_id', { length: 36 }).notNull(),
    type: varchar({ length: 30 }).notNull(),
    title: varchar({ length: 200 }).notNull(),
    content: text(),
    relatedId: int('related_id'),
    relatedType: varchar('related_type', { length: 30 }),
    isRead: boolean('is_read').default(false).notNull(),
    createdAt: timestamp('created_at', { mode: 'string' }).defaultNow().notNull(),
  },
  (table) => [
    index('messages_is_read_idx').on(table.isRead),
    index('messages_user_id_idx').on(table.userId),
    foreignKey({ columns: [table.userId], foreignColumns: [users.id], name: 'messages_user_id_fkey' }),
  ]
);

/** 私信会话 */
export const conversations = mysqlTable(
  'conversations',
  {
    id: int().autoincrement().primaryKey().notNull(),
    user1Id: varchar('user1_id', { length: 36 }).notNull(),
    user2Id: varchar('user2_id', { length: 36 }).notNull(),
    lastMessage: text('last_message'),
    lastMessageAt: timestamp('last_message_at', { mode: 'string' }),
    createdAt: timestamp('created_at', { mode: 'string' }).defaultNow().notNull(),
  },
  (table) => [
    index('conversations_user1_id_idx').on(table.user1Id),
    index('conversations_user2_id_idx').on(table.user2Id),
    foreignKey({ columns: [table.user1Id], foreignColumns: [users.id], name: 'conversations_user1_id_fkey' }),
    foreignKey({ columns: [table.user2Id], foreignColumns: [users.id], name: 'conversations_user2_id_fkey' }),
    unique('conversations_user1_id_user2_id_key').on(table.user1Id, table.user2Id),
  ]
);

/** 私信消息 */
export const privateMessages = mysqlTable(
  'private_messages',
  {
    id: int().autoincrement().primaryKey().notNull(),
    conversationId: int('conversation_id').notNull(),
    senderId: varchar('sender_id', { length: 36 }).notNull(),
    receiverId: varchar('receiver_id', { length: 36 }).notNull(),
    content: text().notNull(),
    isRead: boolean('is_read').default(false).notNull(),
    createdAt: timestamp('created_at', { mode: 'string' }).defaultNow().notNull(),
  },
  (table) => [
    index('private_messages_conversation_id_idx').on(table.conversationId),
    index('private_messages_receiver_id_idx').on(table.receiverId),
    index('private_messages_sender_id_idx').on(table.senderId),
    foreignKey({
      columns: [table.conversationId],
      foreignColumns: [conversations.id],
      name: 'private_messages_conversation_id_fkey',
    }),
    foreignKey({ columns: [table.senderId], foreignColumns: [users.id], name: 'private_messages_sender_id_fkey' }),
    foreignKey({ columns: [table.receiverId], foreignColumns: [users.id], name: 'private_messages_receiver_id_fkey' }),
  ]
);

// ============================================================
// 文件
// ============================================================

/** 上传文件记录（兼容本地磁盘和对象存储，便于统计与清理） */
export const uploadedFiles = mysqlTable(
  'uploaded_files',
  {
    id: int().autoincrement().primaryKey().notNull(),
    /** 唯一存储标识：本地文件名或对象存储 key */
    filename: varchar({ length: 255 }).notNull(),
    /** 原始文件名 */
    originalName: varchar('original_name', { length: 500 }).notNull(),
    /** 访问地址：本地相对路径、MinIO 稳定代理地址或公开桶地址 */
    url: text().notNull(),
    mimeType: varchar('mime_type', { length: 200 }),
    /** 业务分类：image / video / audio / document / archive / general */
    category: varchar({ length: 30 }),
    size: bigint({ mode: 'number' }),
    uploaderId: varchar('uploader_id', { length: 36 }),
    createdAt: timestamp('created_at', { mode: 'string' }).defaultNow().notNull(),
  },
  (table) => [
    index('uploaded_files_uploader_id_idx').on(table.uploaderId),
    unique('uploaded_files_filename_key').on(table.filename),
  ]
);

// ============================================================
// 行为埋点 / 审计
// ============================================================

/** 用户行为记录 */
export const userBehaviors = mysqlTable(
  'user_behaviors',
  {
    id: int().autoincrement().primaryKey().notNull(),
    userId: varchar('user_id', { length: 36 }).notNull(),
    targetType: varchar('target_type', { length: 30 }).notNull(),
    targetId: int('target_id').notNull(),
    action: varchar({ length: 30 }).notNull(),
    duration: int(),
    createdAt: timestamp('created_at', { mode: 'string' }).defaultNow().notNull(),
  },
  (table) => [
    index('user_behaviors_created_at_idx').on(table.createdAt),
    index('user_behaviors_target_idx').on(table.targetType, table.targetId),
    index('user_behaviors_user_id_idx').on(table.userId),
    foreignKey({ columns: [table.userId], foreignColumns: [users.id], name: 'user_behaviors_user_id_fkey' }),
  ]
);

/** 操作审计日志（管理端关键操作建议写入此表） */
export const audits = mysqlTable(
  'audits',
  {
    id: int().autoincrement().primaryKey().notNull(),
    targetType: varchar('target_type', { length: 30 }).notNull(),
    targetId: int('target_id').notNull(),
    auditorId: varchar('auditor_id', { length: 36 }).notNull(),
    action: varchar({ length: 30 }),
    status: varchar({ length: 20 }).notNull(),
    reason: text(),
    createdAt: timestamp('created_at', { mode: 'string' }).defaultNow().notNull(),
  },
  (table) => [
    index('audits_target_idx').on(table.targetType, table.targetId),
    index('audits_auditor_id_idx').on(table.auditorId),
  ]
);

// ============================================================
// 类型导出
// ============================================================

export type User = InferSelectModel<typeof users>;
export type NewUser = InferInsertModel<typeof users>;
export type SystemConfig = InferSelectModel<typeof systemConfig>;
export type Message = InferSelectModel<typeof messages>;
export type Conversation = InferSelectModel<typeof conversations>;
export type PrivateMessage = InferSelectModel<typeof privateMessages>;
export type UploadedFile = InferSelectModel<typeof uploadedFiles>;
export type Follow = InferSelectModel<typeof follows>;
export type UserBehavior = InferSelectModel<typeof userBehaviors>;
export type Audit = InferSelectModel<typeof audits>;
