#!/bin/bash
# ============================================================
# VueFileManager 部署脚本
# 用法: ./deploy.sh [-b] [-r]
#   -b, --build      上传后在 Docker 容器内执行 yarn build
#   -r, --restart    上传后重启 Docker 容器
# ============================================================

set -e

REMOTE="root@10.10.1.9"
REMOTE_DIR="/opt/node/vueFileManager"
CONTAINER="vueFile"
LOCAL_DIR="$(cd "$(dirname "$0")" && pwd)"

DO_BUILD=false
DO_RESTART=false

while [[ $# -gt 0 ]]; do
  case $1 in
    -b|--build)    DO_BUILD=true; shift ;;
    -r|--restart)  DO_RESTART=true; shift ;;
    -h|--help)
      echo "用法: ./deploy.sh [-b] [-r]"
      echo "  -b, --build      上传后在 Docker 容器内执行 yarn build"
      echo "  -r, --restart    上传后重启 Docker 容器"
      exit 0
      ;;
    *) echo "未知参数: $1"; exit 1 ;;
  esac
done

echo "🚀 开始部署到 ${REMOTE}:${REMOTE_DIR}"
echo ""

# rsync 同步源文件
rsync -avz --progress \
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

# 根据参数决定是否执行远程命令
if [ "$DO_BUILD" = true ] || [ "$DO_RESTART" = true ]; then
  REMOTE_CMD=""
  if [ "$DO_BUILD" = true ]; then
    echo ""
    echo "🔨 正在 Docker 容器内构建..."
    REMOTE_CMD="docker exec ${CONTAINER} sh -c 'cd /app && yarn install && yarn build' && echo '✅ 构建完成'"
  fi
  if [ "$DO_RESTART" = true ]; then
    echo ""
    echo "🔄 正在重启 Docker 容器..."
    if [ -n "$REMOTE_CMD" ]; then
      REMOTE_CMD="${REMOTE_CMD} && "
    fi
    REMOTE_CMD="${REMOTE_CMD}docker restart ${CONTAINER} && echo '✅ 容器已重启'"
  fi
  ssh "${REMOTE}" "${REMOTE_CMD}"
fi

echo ""
echo "🎉 部署完成!"
