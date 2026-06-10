# ============================================================
# VueFileManager 部署脚本 (Windows PowerShell)
# 用法: .\deploy.ps1 [-Build] [-Restart]
#   -Build      上传后在 Docker 容器内执行 yarn build
#   -Restart    上传后重启 Docker 容器
# ============================================================

param(
  [switch]$Build,
  [switch]$Restart,
  [switch]$Help
)

$ErrorActionPreference = "Stop"

if ($Help) {
  Write-Host "用法: .\deploy.ps1 [-Build] [-Restart]"
  Write-Host "  -Build      上传后在 Docker 容器内执行 yarn build"
  Write-Host "  -Restart    上传后重启 Docker 容器"
  exit 0
}

$REMOTE = "root@10.10.1.9"
$REMOTE_DIR = "/opt/node/vueFileManager"
$CONTAINER = "vueFile"
$LOCAL_DIR = $PSScriptRoot
$SSH_SOCKET = "$env:TEMP\vfm-deploy-$PID"

# 检查依赖
if (-not (Get-Command ssh -ErrorAction SilentlyContinue)) {
  Write-Host "❌ 需要 OpenSSH（Windows 10+ 自带），请在 设置 > 应用 > 可选功能 中安装" -ForegroundColor Red
  exit 1
}
if (-not (Get-Command rsync -ErrorAction SilentlyContinue)) {
  Write-Host "❌ 需要 rsync，请通过以下方式安装:" -ForegroundColor Red
  Write-Host "   Git for Windows 自带（使用 Git Bash 运行 deploy.sh）"
  Write-Host "   或: winget install MSYS2.MSYS2  然后在 MSYS2 中 pacman -S rsync"
  exit 1
}

function Cleanup {
  ssh -S $SSH_SOCKET -O exit $REMOTE 2>$null
}

try {
  Write-Host "🚀 开始部署到 ${REMOTE}:${REMOTE_DIR}"
  Write-Host ""

  # 建立 SSH 主连接（仅此处输入一次密码）
  Write-Host "🔑 建立 SSH 连接..."
  ssh -M -S $SSH_SOCKET -fN -o ControlPersist=60s $REMOTE

  # rsync 复用 SSH 连接
  $excludes = @(
    "node_modules", "dist", "data", "uploads",
    ".git", ".DS_Store", ".*", "__MACOSX",
    "*.db", "*.tsbuildinfo",
    ".idea", ".vscode", ".claude",
    ".yarn", ".yarnrc.yml",
    "yarn.lock", "package-lock.json",
    "vite.config.js", "vite.config.d.ts",
    "examples", "config.yml", ".env", ".env.*"
  )

  $rsyncArgs = @("-avz", "--progress")
  foreach ($ex in $excludes) { $rsyncArgs += "--exclude=$ex" }
  $rsyncArgs += "--delete"
  $rsyncArgs += "-e"
  $rsyncArgs += "ssh -S $SSH_SOCKET"
  $rsyncArgs += "$LOCAL_DIR/"
  $rsyncArgs += "${REMOTE}:${REMOTE_DIR}/"

  rsync @rsyncArgs

  Write-Host ""
  Write-Host "✅ 文件同步完成" -ForegroundColor Green

  # 拼接远程命令，单次 SSH 执行
  if ($Build -or $Restart) {
    $remoteCmd = ""
    if ($Build) {
      Write-Host ""
      Write-Host "🔨 正在 Docker 容器内构建..."
      $remoteCmd = "docker exec ${CONTAINER} sh -c 'cd /app && yarn install && yarn build' && echo '✅ 构建完成'"
    }
    if ($Restart) {
      Write-Host ""
      Write-Host "🔄 正在重启 Docker 容器..."
      if ($remoteCmd) { $remoteCmd += " && " }
      $remoteCmd += "docker restart ${CONTAINER} && echo '✅ 容器已重启'"
    }
    ssh -S $SSH_SOCKET $REMOTE $remoteCmd
  }

  Write-Host ""
  Write-Host "🎉 部署完成!" -ForegroundColor Green
} finally {
  Cleanup
}
