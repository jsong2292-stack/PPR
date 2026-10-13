#!/usr/bin/env node
/**
 * 工具链检查（preinstall / postinstall 钩子）。
 *
 * 背景：本项目对运行时与包管理器有硬性要求
 *   - Node.js 20.x / 24.x（部署平台声明 `nodejs-24`，见 runtime.txt）
 *   - pnpm 9 及以上（package.json 的 engines.pnpm 由 pnpm 自身校验）
 *
 * npm / yarn 安装时不会走 pnpm 的版本校验，因此这里主动拦截：
 * 用 npm、yarn 或过低版本的 Node 安装会直接失败，避免产出与部署环境不一致的依赖树。
 *
 * 允许 CI 或特殊场景跳过：设置环境变量 SKIP_TOOLCHAIN_CHECK=1。
 */
import process from 'node:process';

const SKIP = process.env.SKIP_TOOLCHAIN_CHECK === '1';
const SUPPORTED_MAJOR = [20, 24];

function fail(lines) {
  const message = Array.isArray(lines) ? lines.join('\n') : lines;
  console.error(`\n[工具链检查未通过]\n${message}\n`);
  process.exit(1);
}

if (SKIP) {
  console.log('[工具链检查] 已按 SKIP_TOOLCHAIN_CHECK=1 跳过。');
  process.exit(0);
}

// ── 1. Node.js 版本 ────────────────────────────────────────────────
const nodeVersion = process.versions.node;
const nodeMajor = Number(nodeVersion.split('.')[0]);

if (!SUPPORTED_MAJOR.includes(nodeMajor)) {
  fail([
    `当前 Node.js 版本：v${nodeVersion}`,
    `本项目要求 Node.js ${SUPPORTED_MAJOR.join('.x / ')}.x。`,
    '请使用 nvm / fnm 切换版本后重试，例如：',
    '  nvm install 24 && nvm use 24',
    '部署环境请保持 runtime.txt 中的 nodejs-24 声明。',
  ]);
}

// ── 2. 包管理器 ────────────────────────────────────────────────────
const userAgent = process.env.npm_config_user_agent ?? '';
const execPath = process.env.npm_execpath ?? '';
const isPnpm = userAgent.startsWith('pnpm/') || /pnpm/.test(execPath);

if (!isPnpm) {
  const detected = userAgent.split(' ')[0] || '未知';
  fail([
    `检测到的包管理器：${detected}`,
    '本项目只使用 pnpm（package.json 中已声明 packageManager: pnpm）。',
    '请改用：',
    '  corepack enable && pnpm install',
    '不要提交 npm / yarn 生成的 lock 文件。',
  ]);
}

// ── 3. pnpm 主版本 ────────────────────────────────────────────────
const pnpmVersion = userAgent.startsWith('pnpm/') ? userAgent.split(' ')[0].slice(5) : null;
if (pnpmVersion) {
  const pnpmMajor = Number(pnpmVersion.split('.')[0]);
  if (Number.isFinite(pnpmMajor) && pnpmMajor < 9) {
    fail([
      `当前 pnpm 版本：${pnpmVersion}`,
      '本项目要求 pnpm 9 及以上。请升级：',
      '  corepack enable && corepack prepare pnpm@latest --activate',
    ]);
  }
}

const phase = process.argv.includes('--post') ? 'postinstall' : 'preinstall';
console.log(
  `[工具链检查] ${phase} 通过：Node.js v${nodeVersion}${pnpmVersion ? ` · pnpm ${pnpmVersion}` : ''}`,
);
