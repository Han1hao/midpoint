$ErrorActionPreference = 'Stop'
$DeployDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $DeployDir
docker compose ps
try {
    $Response = Invoke-WebRequest -UseBasicParsing -Uri 'http://localhost:8080/midpoint/' -TimeoutSec 10
    Write-Host "HTTP 状态：$($Response.StatusCode)" -ForegroundColor Green
} catch {
    Write-Host "页面暂不可访问：$($_.Exception.Message)" -ForegroundColor Yellow
}
