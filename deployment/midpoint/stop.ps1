$ErrorActionPreference = 'Stop'
$DeployDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $DeployDir
docker compose down
