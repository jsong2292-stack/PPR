/**
 * 统一日志。
 *
 * 单文件、零依赖、结构化输出（JSON Lines），方便容器日志采集。
 * 开发环境输出带颜色的人类可读格式。
 *
 * 设计取舍：本项目不引入 pino/winston —— 需求只需要「分级 + 结构化 + 可采样」，
 * 自己实现 30 行比多一个依赖更可控，也避免打包器对日志库的动态 require 报错。
 */
import process from 'node:process';
import { config } from './config';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_WEIGHT: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const COLOR: Record<LogLevel, string> = {
  debug: '\u001b[90m',
  info: '\u001b[36m',
  warn: '\u001b[33m',
  error: '\u001b[31m',
};
const RESET = '\u001b[0m';

function enabled(level: LogLevel): boolean {
  return LEVEL_WEIGHT[level] >= LEVEL_WEIGHT[config.logging.level];
}

function normalizeError(value: unknown): unknown {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  return value;
}

function emit(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
  if (!enabled(level)) return;

  const normalized = meta
    ? Object.fromEntries(Object.entries(meta).map(([k, v]) => [k, normalizeError(v)]))
    : undefined;

  if (config.isProduction) {
    const payload = {
      time: new Date().toISOString(),
      level,
      msg: message,
      ...(normalized ?? {}),
    };
    const line = JSON.stringify(payload);
    if (level === 'error') process.stderr.write(`${line}\n`);
    else process.stdout.write(`${line}\n`);
    return;
  }

  const stamp = new Date().toLocaleTimeString('zh-CN', { hour12: false });
  const suffix = normalized ? ` ${JSON.stringify(normalized)}` : '';
  process.stdout.write(`${COLOR[level]}[${stamp}] ${level.toUpperCase()}${RESET} ${message}${suffix}\n`);
}

export const logger = {
  debug: (message: string, meta?: Record<string, unknown>) => emit('debug', message, meta),
  info: (message: string, meta?: Record<string, unknown>) => emit('info', message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => emit('warn', message, meta),
  error: (message: string, meta?: Record<string, unknown>) => emit('error', message, meta),
};
