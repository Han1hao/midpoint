$ErrorActionPreference = 'Stop'
$DeployDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $DeployDir

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw 'Docker CLI was not found. Install and start Docker Desktop first.'
}

docker info | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Cannot connect to Docker Desktop. Make sure Docker Desktop is running.' }
docker compose version | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Docker Compose is not available.' }
docker compose config --quiet
if ($LASTEXITCODE -ne 0) { throw 'docker-compose.yml validation failed.' }
docker compose pull
if ($LASTEXITCODE -ne 0) { throw 'Image pull failed.' }
docker compose up -d
if ($LASTEXITCODE -ne 0) { throw 'Container startup failed.' }

Write-Host 'Waiting for midPoint health check (first start usually takes 2-5 minutes)...'
$Deadline = (Get-Date).AddMinutes(8)
do {
    $Status = docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' midpoint-local-midpoint-1 2>$null
    if ($Status -eq 'healthy') { break }
    if ($Status -eq 'unhealthy' -or (Get-Date) -gt $Deadline) {
        docker compose ps
        docker compose logs --tail 120 midpoint
        throw "midPoint did not become healthy in time. Current status: $Status"
    }
    Start-Sleep -Seconds 10
} while ($true)

docker compose ps
Write-Host ''
Write-Host 'Deployment complete: http://localhost:8080/midpoint/' -ForegroundColor Green
Write-Host 'Initial username: administrator'
Write-Host 'Change the initial password immediately after first login.'
