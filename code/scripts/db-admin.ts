/**
 * 管理员账号维护工具。
 *
 *   pnpm db:admin --list                  列出全部账号与角色
 *   pnpm db:admin --reset admin           重置指定账号口令（自动生成强随机口令并打印一次）
 *   pnpm db:admin --reset admin --password 'Xxxx@1234'   指定新口令
 *   pnpm db:admin --disable <username>    停用账号
 *   pnpm db:admin --enable  <username>    启用账号
 *   pnpm db:admin --grant <username> <roleCode>   追加角色
 *
 * 用途：BOOTSTRAP_ADMIN_PASSWORD 只在首次部署时使用，之后正式环境的
 * 口令找回不应该依赖「改环境变量再重启服务」，那会把口令留在环境里。
 * 本脚本直接以迁移账号连库改密，并 bump session_version 让旧会话立即失效。
 *
 * 注意：重置口令属于敏感操作，脚本会在终端打印操作记录，请勿把口令写入工单或聊天记录。
 */
import process from 'node:process';
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { connectAs, initScriptEnv } from './lib/db-utils';
import { config } from '../src/lib/config';

interface Arguments {
  list: boolean;
  reset?: string;
  password?: string;
  disable?: string;
  enable?: string;
  grant?: { username: string; roleCode: string };
}

function parseArguments(argv: string[]): Arguments {
  const result: Arguments = { list: false };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];
    switch (token) {
      case '--list':
      case 'list':
        result.list = true;
        break;
      case '--reset':
        result.reset = next;
        index += 1;
        break;
      case '--password':
        result.password = next;
        index += 1;
        break;
      case '--disable':
        result.disable = next;
        index += 1;
        break;
      case '--enable':
        result.enable = next;
        index += 1;
        break;
      case '--grant':
        result.grant = { username: next, roleCode: argv[index + 2] };
        index += 2;
        break;
      default:
        break;
    }
  }
  return result;
}

/** 生成可人工转述的强口令：24 位，含大小写、数字与符号 */
function generatePassword(): string {
  const alphabet = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const symbols = '!@#$%^&*-_=+';
  const bytes = randomBytes(20);
  let raw = '';
  for (const byte of bytes) raw += alphabet[byte % alphabet.length];
  const symbolIndex = bytes[0] % symbols.length;
  return `${raw.slice(0, 10)}${symbols[symbolIndex]}${raw.slice(10)}9`;
}

async function main(): Promise<void> {
  const args = parseArguments(process.argv.slice(2));
  const db = initScriptEnv();
  const connection = await connectAs(db);

  try {
    if (!args.list && !args.reset && !args.disable && !args.enable && !args.grant) {
      console.log('未指定操作，默认列出账号。用法见 scripts/db-admin.ts 头部注释。');
      args.list = true;
    }

    if (args.list) {
      const [rows] = await connection.query<any[]>(
        `SELECT u.id, u.username, u.display_name AS displayName, u.status, u.email,
                u.session_version AS sessionVersion, u.last_login_at AS lastLoginAt,
                GROUP_CONCAT(r.code ORDER BY r.code) AS roles
           FROM sys_user u
           LEFT JOIN sys_user_role ur ON ur.user_id = u.id
           LEFT JOIN sys_role r ON r.id = ur.role_id
          GROUP BY u.id
          ORDER BY u.id`,
      );
      console.log(`共 ${rows.length} 个账号：`);
      for (const row of rows) {
        console.log(
          `  #${row.id} ${row.username}（${row.displayName}）状态=${row.status} ` +
            `角色=${row.roles ?? '无'} 邮箱=${row.email ?? '未填'} ` +
            `会话版本=${row.sessionVersion} 最近登录=${row.lastLoginAt ?? '从未'}`,
        );
      }
    }

    if (args.reset) {
      const [rows] = await connection.query<any[]>(
        'SELECT id, username FROM sys_user WHERE username = ?',
        [args.reset],
      );
      if (!rows.length) {
        console.error(`账号 ${args.reset} 不存在。`);
        process.exitCode = 1;
        return;
      }
      const password = args.password ?? generatePassword();
      const rounds = config.auth.bcryptRounds;
      const hash = await bcrypt.hash(password, rounds);
      await connection.execute(
        `UPDATE sys_user
            SET password_hash = ?, must_reset_password = 1, status = 'active',
                session_version = session_version + 1, updated_at = NOW()
          WHERE id = ?`,
        [hash, rows[0].id],
      );
      console.log(`已重置账号 ${args.reset} 的口令（并要求下次登录修改）。`);
      console.log(`新口令：${password}`);
      console.log('该账号的既有登录会话已失效（session_version 已递增）。');
    }

    for (const [action, username] of [
      ['disable', args.disable],
      ['enable', args.enable],
    ] as const) {
      if (!username) continue;
      const status = action === 'disable' ? 'disabled' : 'active';
      const [result] = await connection.execute<any>(
        `UPDATE sys_user SET status = ?, session_version = session_version + 1, updated_at = NOW()
          WHERE username = ?`,
        [status, username],
      );
      if (!result.affectedRows) {
        console.error(`账号 ${username} 不存在。`);
        process.exitCode = 1;
      } else {
        console.log(`账号 ${username} 已${action === 'disable' ? '停用' : '启用'}，旧会话已失效。`);
      }
    }

    if (args.grant) {
      const { username, roleCode } = args.grant;
      const [users] = await connection.query<any[]>(
        'SELECT id FROM sys_user WHERE username = ?',
        [username],
      );
      const [roles] = await connection.query<any[]>('SELECT id FROM sys_role WHERE code = ?', [
        roleCode,
      ]);
      if (!users.length || !roles.length) {
        console.error(`账号或角色不存在：${username} / ${roleCode}`);
        process.exitCode = 1;
        return;
      }
      await connection.execute(
        `INSERT INTO sys_user_role (user_id, role_id, granted_at)
         VALUES (?, ?, NOW())
         ON DUPLICATE KEY UPDATE granted_at = VALUES(granted_at)`,
        [users[0].id, roles[0].id],
      );
      await connection.execute(
        'UPDATE sys_user SET session_version = session_version + 1 WHERE id = ?',
        [users[0].id],
      );
      console.log(`已为 ${username} 追加角色 ${roleCode}，该账号需要重新登录以获取新权限。`);
    }
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(`管理操作失败：${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
