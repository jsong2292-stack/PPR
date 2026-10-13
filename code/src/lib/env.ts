/**
 * 环境变量加载。
 *
 * Next.js 自身会加载 `.env*`，但自定义 Server、迁移脚本、种子脚本都在 Next 之外
 * 运行，必须显式加载，否则会出现「应用能连库、脚本连不上」这类不一致。
 *
 * 加载顺序（后者覆盖前者）：
 *   .env < .env.local < .env.<NODE_ENV> < .env.<NODE_ENV>.local
 * 真实环境变量（process.env 中已存在的值）始终优先，便于容器与 CI 注入。
 *
 * Next.js 官方提供的 `@next/env` 已内置上述顺序与语法，这里直接复用，
 * 不再自行实现一份容易与框架行为漂移的解析逻辑。
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const LOADED_FLAG = '__PPR_ENV_LOADED__';

/** 幂等：同一进程内重复调用只加载一次 */
export function loadEnv(): void {
  if (process.env[LOADED_FLAG] === '1') return;
  process.env[LOADED_FLAG] = '1';

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { loadEnvConfig } = require('@next/env') as {
      loadEnvConfig: (dir: string, dev?: boolean) => unknown;
    };
    loadEnvConfig(process.cwd(), process.env.NODE_ENV !== 'production');
  } catch {
    // 未安装 @next/env（例如裁剪过的运行环境）时退化为手工加载。
    loadDotEnvFallback();
  }
}

/**
 * 兜底解析 .env / .env.local。
 * 仅支持 `KEY=VALUE`、`#` 注释与成对引号，够本项目的脚本使用。
 */
function loadDotEnvFallback(): void {
  for (const file of ['.env', '.env.local']) {
    const filePath = path.join(process.cwd(), file);
    if (!fs.existsSync(filePath)) continue;
    for (const rawLine of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const separator = line.indexOf('=');
      if (separator === -1) continue;
      const key = line.slice(0, separator).trim();
      let value = line.slice(separator + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = value;
    }
  }
}
