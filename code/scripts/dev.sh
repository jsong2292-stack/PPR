#!/bin/bash
set -eu

PORT="${PORT:-9010}"
COZE_WORKSPACE_PATH="${COZE_WORKSPACE_PATH:-$(pwd)}"
DEPLOY_RUN_PORT="${DEPLOY_RUN_PORT:-${PORT}}"

cd "${COZE_WORKSPACE_PATH}"

# 释放被占用的端口：优先使用 ss（Linux），macOS 回退到 lsof
kill_port_if_listening() {
  local pids=""

  if command -v ss >/dev/null 2>&1; then
    pids=$(ss -H -lntp 2>/dev/null | awk -v port="${DEPLOY_RUN_PORT}" '$4 ~ ":"port"$"' | grep -o 'pid=[0-9]*' | cut -d= -f2 | paste -sd' ' - || true)
  elif command -v lsof >/dev/null 2>&1; then
    pids=$(lsof -ti tcp:"${DEPLOY_RUN_PORT}" 2>/dev/null | paste -sd' ' - || true)
  fi

  if [[ -z "${pids}" ]]; then
    echo "Port ${DEPLOY_RUN_PORT} is free."
    return
  fi

  echo "Port ${DEPLOY_RUN_PORT} in use by PIDs: ${pids} (SIGKILL)"
  echo "${pids}" | xargs kill -9 || true
  sleep 1
  echo "Port ${DEPLOY_RUN_PORT} cleared."
}

echo "Clearing port ${DEPLOY_RUN_PORT} before start."
kill_port_if_listening

echo "Starting dev server on port ${DEPLOY_RUN_PORT}..."
NODE_OPTIONS="--require=${COZE_WORKSPACE_PATH}/scripts/load-env.cjs${NODE_OPTIONS:+ ${NODE_OPTIONS}}" \
  PORT=${DEPLOY_RUN_PORT} pnpm tsx watch src/server.ts
