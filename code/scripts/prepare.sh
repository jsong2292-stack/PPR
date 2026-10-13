#!/bin/bash
set -eu

COZE_WORKSPACE_PATH="${COZE_WORKSPACE_PATH:-$(pwd)}"
cd "${COZE_WORKSPACE_PATH}"

echo "Preparing project..."

if [[ ! -f .env.local && -f .env.example ]]; then
  cp .env.example .env.local
  echo "已生成 .env.local，请填写 DATABASE_URL 与 JWT_SECRET"
fi

echo "Installing dependencies..."
pnpm install

echo "Running database migrations..."
node scripts/migrate.js 2>/dev/null || echo "Migration skipped (database not available)"
