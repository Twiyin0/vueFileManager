#!/bin/bash
# ============================================================
# VueFileManager 部署脚本
# 用法: ./deploy.sh [-b] [-r] [-p <password>]
#   -b, --build      上传后在 Docker 容器内执行 yarn build
#   -r, --restart    上传后重启 Docker 容器
#   -p, --password   SSH 密码（不填则免密登录）
# ============================================================

set -e

REMOTE="root@10.10.1.9"
REMOTE_DIR="/opt/node/vueFileManager"
CONTAINER="vueFile"
LOCAL_DIR="$(cd "$(dirname "$0")" && pwd)"

DO_BUILD=false
DO_RESTART=false
SSH_PASS=""

while [[ $# -gt 0 ]]; do
  case $1 in
    -b|--build)    DO_BUILD=true; shift ;;
    -r|--restart)  DO_RESTART=true; shift ;;
    -p|--password) SSH_PASS="$2"; shift 2 ;;
    -h|--help)
      echo "用法: ./deploy.sh [-b] [-r] [-p <password>]"
      echo "  -b, --build      上传后在 Docker 容器内执行 yarn build"
      echo "  -r, --restart    上传后重启 Docker 容器"
      echo "  -p, --password   SSH 密码（不填则免密登录）"
      exit 0
      ;;
    *) echo "未知参数: $1"; exit 1 ;;
  esac
done

# ssh/rsync 封装
ssh_cmd() {
  if [ -n "$SSH_PASS" ]; then
    sshpass -p "$SSH_PASS" ssh "$@"
  else
    ssh "$@"
  fi
}

rsync_cmd() {
  if [ -n "$SSH_PASS" ]; then
    sshpass -p "$SSH_PASS" rsync "$@"
  else
    rsync "$@"
  fi
}

# 检查 sshpass
if [ -n "$SSH_PASS" ] && ! command -v sshpass &>/dev/null; then
  echo "❌ 需要 sshpass，请先安装:"
  echo "   macOS: brew install hudochenkov/sshpass/sshpass"
  echo "   Linux: apt install sshpass"
  exit 1
fi

echo "🚀 开始部署到 ${REMOTE}:${REMOTE_DIR}"
echo ""

# rsync 同步源文件
rsync_cmd -avz --progress \
  --exclude='node_modules' \
  --exclude='dist' \
  --exclude='data' \
  --exclude='uploads' \
  --exclude='.git' \
  --exclude='.DS_Store' \
  --exclude='._*' \
  --exclude='__MACOSX' \
  --exclude='*.db' \
  --exclude='*.tsbuildinfo' \
  --exclude='.idea' \
  --exclude='.vscode' \
  --exclude='.claude' \
  --exclude='.yarn' \
  --exclude='.yarnrc.yml' \
  --exclude='yarn.lock' \
  --exclude='package-lock.json' \
  --exclude='vite.config.js' \
  --exclude='vite.config.d.ts' \
  --exclude='examples' \
  --exclude='config.yml' \
  --exclude='.env' \
  --exclude='.env.*' \
  --delete \
  "${LOCAL_DIR}/" "${REMOTE}:${REMOTE_DIR}/"

echo ""
echo "✅ 文件同步完成"

# Docker 容器内构建
if [ "$DO_BUILD" = true ]; then
  echo ""
  echo "🔨 正在 Docker 容器内构建..."
  ssh_cmd "${REMOTE}" "docker exec ${CONTAINER} sh -c 'cd /app && yarn install && yarn build'"
  echo "✅ 构建完成"
fi

# 重启容器
if [ "$DO_RESTART" = true ]; then
  echo ""
  echo "🔄 正在重启 Docker 容器..."
  ssh_cmd "${REMOTE}" "docker restart ${CONTAINER}"
  echo "✅ 容器已重启"
fi

echo ""
echo "🎉 部署完成!"
