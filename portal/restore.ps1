param(
  [Parameter(Mandatory = $true)][string]$BackupDir,
  [switch]$ConfirmRestore
)
$ErrorActionPreference = 'Stop'
if (-not $ConfirmRestore) { throw 'Restore overwrites current data. Run again with -ConfirmRestore after verifying the backup path.' }
$project = Split-Path -Parent $MyInvocation.MyCommand.Path
$resolved = [IO.Path]::GetFullPath($BackupDir)
if (-not (Test-Path -LiteralPath (Join-Path $resolved 'manifest.json'))) { throw 'Backup manifest not found.' }

$portalBackup = Join-Path $resolved 'governance-store.json'
if (Test-Path -LiteralPath $portalBackup) {
  $dataDir = Join-Path $project 'data'
  New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
  Copy-Item -LiteralPath $portalBackup -Destination (Join-Path $dataDir 'governance-store.json') -Force
}

$dbBackup = Join-Path $resolved 'midpoint-postgres.sql'
if (Test-Path -LiteralPath $dbBackup) {
  Get-Content -Raw -LiteralPath $dbBackup | docker exec -i midpoint-local-db-1 psql -U midpoint -d midpoint
  if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL restore failed.' }
}
Write-Host 'Restore completed. Restart midPoint and the portal.' -ForegroundColor Green

