#!/bin/bash
set -eu

COZE_WORKSPACE_PATH="${COZE_WORKSPACE_PATH:-$(pwd)}"
PORT="${PORT:-9010}"
DEPLOY_RUN_PORT="${DEPLOY_RUN_PORT:-$PORT}"

cd "${COZE_WORKSPACE_PATH}"

if [[ ! -f dist/server.js ]]; then
  echo "未找到 dist/server.js，请先执行 pnpm build"
  exit 1
fi

echo "Starting HTTP service on port ${DEPLOY_RUN_PORT} for deploy..."
NODE_OPTIONS="--require=${COZE_WORKSPACE_PATH}/scripts/load-env.cjs${NODE_OPTIONS:+ ${NODE_OPTIONS}}" \
  NODE_ENV="${NODE_ENV:-production}" PORT=${DEPLOY_RUN_PORT} node dist/server.js
