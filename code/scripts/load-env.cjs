/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS preload runs before the server bundle */
/**
 * 在自定义 Next.js Server 及其静态导入执行前加载本地环境变量。
 * Next.js 会为应用代码加载 .env*，但自定义 Server 顶层代码会更早执行。
 */
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

for (const filename of ['.env.local', '.env']) {
  const envPath = path.resolve(process.cwd(), filename);
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath, quiet: true, override: false });
  }
}
