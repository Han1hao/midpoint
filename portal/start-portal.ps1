$ErrorActionPreference = 'Stop'
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $dir

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw '未找到 Node.js。请安装 Node.js 22。'
}
$server = Join-Path $dir 'scripts\local-server.mjs'
if (-not (Test-Path (Join-Path $dir 'node_modules\vinext\dist\cli.js'))) {
  throw '依赖尚未安装。请先在 portal 目录执行 pnpm install --frozen-lockfile。'
}
if (-not (Test-Path (Join-Path $dir 'dist\server\index.js'))) {
  throw '门户尚未构建。请先在 portal 目录执行 pnpm run build。'
}
$env:WRANGLER_LOG_PATH = Join-Path $dir '.wrangler\wrangler.log'
Write-Host '饭团账号管理平台正在启动：http://localhost:3001' -ForegroundColor Cyan
Write-Host 'midPoint 应运行在：http://127.0.0.1:8080/midpoint/' -ForegroundColor DarkCyan
& node $server
