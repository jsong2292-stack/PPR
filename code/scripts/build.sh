#!/bin/bash
set -eu

COZE_WORKSPACE_PATH="${COZE_WORKSPACE_PATH:-$(pwd)}"
cd "${COZE_WORKSPACE_PATH}"

echo "Installing dependencies..."
pnpm install

echo "Running database migrations (optional)..."
node scripts/migrate.js 2>/dev/null || echo "跳过迁移（数据库未就绪）"

echo "Building the Next.js project..."
pnpm next build

echo "Bundling server with tsup..."
pnpm tsup src/server.ts --format cjs --platform node --target node20 --outDir dist --no-splitting --no-minify

echo "Build completed successfully!"
