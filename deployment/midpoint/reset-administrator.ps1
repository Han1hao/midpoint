param(
  [Parameter(Mandatory = $true)]
  [string]$NewPassword,
  [string]$ResultFile = ''
)

$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $ResultFile) { $ResultFile = Join-Path $project 'reset-result.json' }
$container = 'midpoint-local-midpoint-1'
$remoteExport = '/tmp/codex-administrator-reset.xml'
$localExport = Join-Path ([IO.Path]::GetTempPath()) ("midpoint-admin-{0}.xml" -f [Guid]::NewGuid().ToString('N'))

function Save-Result([bool]$Success, [string]$Message) {
  @{
    success = $Success
    message = $Message
    completedAt = (Get-Date).ToString('o')
  } | ConvertTo-Json | Set-Content -LiteralPath $ResultFile -Encoding utf8
}

try {
  if ($NewPassword.Length -lt 12) { throw 'New administrator password must contain at least 12 characters.' }
  docker inspect $container --format '{{.State.Status}}' | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'The midPoint container is unavailable.' }

  docker exec $container /opt/midpoint/bin/ninja.sh export --oid 00000000-0000-0000-0000-000000000002 --output $remoteExport --overwrite
  if ($LASTEXITCODE -ne 0) { throw 'Could not export the administrator object.' }
  docker cp "${container}:${remoteExport}" $localExport
  if ($LASTEXITCODE -ne 0) { throw 'Could not copy the administrator object from the container.' }

  [xml]$document = Get-Content -LiteralPath $localExport -Raw
  $manager = New-Object System.Xml.XmlNamespaceManager($document.NameTable)
  $manager.AddNamespace('c', 'http://midpoint.evolveum.com/xml/ns/public/common/common-3')
  $value = $document.SelectSingleNode('//*[local-name()="credentials"]/*[local-name()="password"]/*[local-name()="value"]', $manager)
  if (-not $value) { throw 'The administrator password value was not found in the exported object.' }
  $value.RemoveAll()
  $clear = $document.CreateElement('clearValue', 'http://prism.evolveum.com/xml/ns/public/types-3')
  $clear.InnerText = $NewPassword
  [void]$value.AppendChild($clear)
  $document.Save($localExport)

  docker cp $localExport "${container}:${remoteExport}"
  if ($LASTEXITCODE -ne 0) { throw 'Could not copy the updated administrator object into the container.' }
  docker exec $container /opt/midpoint/bin/ninja.sh import --input $remoteExport --overwrite
  if ($LASTEXITCODE -ne 0) { throw 'Could not import the updated administrator object.' }
  docker restart $container | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Could not restart the midPoint container.' }

  $token = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes("administrator:$NewPassword"))
  $verified = $false
  for ($attempt = 0; $attempt -lt 90; $attempt++) {
    Start-Sleep -Seconds 2
    try {
      $response = Invoke-WebRequest -Uri 'http://127.0.0.1:8080/midpoint/ws/rest/self' -Headers @{ Authorization = "Basic $token"; Accept = 'application/json' } -SkipHttpErrorCheck -TimeoutSec 5
      if ([int]$response.StatusCode -eq 200) { $verified = $true; break }
    } catch {}
  }
  if (-not $verified) { throw 'Password was imported, but REST login verification did not succeed after restart.' }
  Save-Result $true 'Administrator password reset and REST login verification succeeded.'
} catch {
  Save-Result $false $_.Exception.Message
  exit 1
} finally {
  if (Test-Path -LiteralPath $localExport) { Remove-Item -LiteralPath $localExport -Force }
}
