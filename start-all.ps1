$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

$midpointEnv = Join-Path $root 'deployment\midpoint\.env'
$portalEnv = Join-Path $root 'portal\.env.local'
if (-not (Test-Path -LiteralPath $midpointEnv)) {
  throw '缺少 deployment\midpoint\.env，请先从 .env.example 复制并设置数据库密码。'
}
if (-not (Test-Path -LiteralPath $portalEnv)) {
  throw '缺少 portal\.env.local，请先从 .env.example 复制。'
}

& (Join-Path $root 'deployment\midpoint\start.ps1')
if ($LASTEXITCODE -ne 0) { throw 'midPoint 启动失败。' }

& (Join-Path $root 'portal\start-portal.ps1')

