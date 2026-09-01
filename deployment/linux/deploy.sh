#!/usr/bin/env bash
set -Eeuo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd -- "${script_dir}/../.." && pwd)"
midpoint_dir="${repo_root}/deployment/midpoint"
portal_dir="${repo_root}/portal"
venv_dir="${repo_root}/.venv"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "缺少命令：$1" >&2
    exit 1
  fi
}

for command_name in docker node corepack python3; do
  require_command "${command_name}"
done

if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose 插件不可用，请先安装 docker-compose-plugin。" >&2
  exit 1
fi

node_major="$(node -p 'Number(process.versions.node.split(".")[0])')"
if (( node_major < 22 )); then
  echo "Node.js 版本过低，需要 Node.js 22 或更高版本。" >&2
  exit 1
fi

if [[ ! -f "${midpoint_dir}/.env" ]]; then
  echo "缺少 deployment/midpoint/.env，请从 .env.example 复制并设置 DB_PASSWORD。" >&2
  exit 1
fi
if [[ ! -f "${portal_dir}/.env.local" ]]; then
  echo "缺少 portal/.env.local，请从 .env.example 复制。" >&2
  exit 1
fi
if grep -Eq '^DB_PASSWORD=(replace-with-a-long-random-password)?$' "${midpoint_dir}/.env"; then
  echo "请先在 deployment/midpoint/.env 中设置非空随机 DB_PASSWORD。" >&2
  exit 1
fi

chmod 600 "${midpoint_dir}/.env" "${portal_dir}/.env.local"

python3 -m venv "${venv_dir}"
"${venv_dir}/bin/python" -m pip install --upgrade pip
"${venv_dir}/bin/python" -m pip install openpyxl

if ! grep -q '^PYTHON_PATH=' "${portal_dir}/.env.local"; then
  printf '\nPYTHON_PATH=%s\n' "${venv_dir}/bin/python" >> "${portal_dir}/.env.local"
fi

cd "${portal_dir}"
corepack pnpm install --frozen-lockfile
corepack pnpm run build
corepack pnpm run test

cd "${midpoint_dir}"
docker compose config --quiet
docker compose pull
docker compose up -d
docker compose ps

echo
echo "部署构建完成。"
echo "midPoint 仅监听：http://127.0.0.1:8080/midpoint/"
echo "下一步：按 deployment/linux/README.md 安装并启动门户 systemd 服务。"
