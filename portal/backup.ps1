$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $MyInvocation.MyCommand.Path
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$target = Join-Path $project "backups\$stamp"
New-Item -ItemType Directory -Force -Path $target | Out-Null

$governance = Join-Path $project 'data\governance-store.json'
if (Test-Path -LiteralPath $governance) {
  Copy-Item -LiteralPath $governance -Destination (Join-Path $target 'governance-store.json')
}

$dbFile = Join-Path $target 'midpoint-postgres.sql'
docker exec midpoint-local-db-1 pg_dump -U midpoint -d midpoint --clean --if-exists --no-owner | Set-Content -LiteralPath $dbFile -Encoding utf8
if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL backup failed.' }

@{
  createdAt = (Get-Date).ToString('o')
  portalData = (Test-Path -LiteralPath (Join-Path $target 'governance-store.json'))
  midpointDatabase = (Test-Path -LiteralPath $dbFile)
} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $target 'manifest.json') -Encoding utf8
Write-Host "Backup completed: $target" -ForegroundColor Green

