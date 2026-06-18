param(
  [Parameter(Mandatory = $true)]
  [string]$RootPath,

  [string]$ExpectedVersion = '',

  [switch]$SetExpected,

  [switch]$Force,

  [switch]$RegisterThisPC,

  [string]$OutputDir = (Join-Path (Resolve-Path (Join-Path $PSScriptRoot '..')) 'pilot-logs'),

  [switch]$NoPause
)

$ErrorActionPreference = 'Stop'
try {
  & chcp.com 65001 > $null
  [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
  $OutputEncoding = [System.Text.UTF8Encoding]::new($false)
} catch {}

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$packageJson = Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$currentVersion = [string]$packageJson.version
$packageName = [string]$packageJson.name
if ([string]::IsNullOrWhiteSpace($ExpectedVersion)) { $ExpectedVersion = $currentVersion }

$root = (Resolve-Path -LiteralPath $RootPath).Path
if (-not (Test-Path -LiteralPath $root -PathType Container)) { throw "Ana klasör bulunamadı: $RootPath" }
if (-not (Test-Path -LiteralPath $OutputDir)) { New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null }

$officeDir = Join-Path $root '_HASARBOTU_OFFICE'
$clientsDir = Join-Path $officeDir 'clients'
$markerPath = Join-Path $officeDir 'office-version.json'
New-Item -ItemType Directory -Force -Path $clientsDir | Out-Null

function Convert-SafeFileName {
  param([string]$Value)
  $safe = ($Value -replace '[^A-Za-z0-9._-]+', '_').Trim('_')
  if ([string]::IsNullOrWhiteSpace($safe)) { return 'BILINMEYEN-PC' }
  if ($safe.Length -gt 64) { return $safe.Substring(0, 64) }
  return $safe
}

if ($SetExpected) {
  if ($PSBoundParameters.ContainsKey('SetExpected') -and -not $PSBoundParameters.ContainsKey('ExpectedVersion')) {
    throw '-SetExpected kullanılırken -ExpectedVersion açıkça verilmelidir. Eski checkout yanlışlıkla ofis hedef sürümünü geriye çekemez.'
  }
  $existingMarker = $null
  if (Test-Path -LiteralPath $markerPath -PathType Leaf) {
    try { $existingMarker = Get-Content -LiteralPath $markerPath -Raw -Encoding UTF8 | ConvertFrom-Json } catch { $existingMarker = $null }
  }
  $existingVersion = if ($existingMarker -and $existingMarker.expectedVersion) { [string]$existingMarker.expectedVersion } else { '' }
  if (-not [string]::IsNullOrWhiteSpace($existingVersion) -and ([version]$ExpectedVersion -lt [version]$existingVersion) -and -not $Force) {
    throw "Ofis hedef sürümü geriye çekilemez: mevcut v$existingVersion, istenen v$ExpectedVersion. Bilinçli rollback için -Force kullanın."
  }
  $marker = [pscustomobject]@{
    schemaVersion = 1
    expectedVersion = $ExpectedVersion
    packageName = $packageName
    setAt = (Get-Date).ToString('s')
    setByComputer = $env:COMPUTERNAME
  }
  $marker | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $markerPath -Encoding UTF8
}

if ($RegisterThisPC) {
  $client = [pscustomobject]@{
    computer = $env:COMPUTERNAME
    user = $env:USERNAME
    appVersion = $currentVersion
    packageName = $packageName
    platform = 'win32'
    rootPath = $root
    recordedAt = (Get-Date).ToString('s')
  }
  $clientPath = Join-Path $clientsDir ("$(Convert-SafeFileName $env:COMPUTERNAME).json")
  $client | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $clientPath -Encoding UTF8
}

$markerObject = $null
if (Test-Path -LiteralPath $markerPath -PathType Leaf) {
  try { $markerObject = Get-Content -LiteralPath $markerPath -Raw -Encoding UTF8 | ConvertFrom-Json } catch { $markerObject = $null }
}

$clients = @()
Get-ChildItem -LiteralPath $clientsDir -File -Filter '*.json' -ErrorAction SilentlyContinue | ForEach-Object {
  try {
    $clients += (Get-Content -LiteralPath $_.FullName -Raw -Encoding UTF8 | ConvertFrom-Json)
  } catch {}
}
$versions = @($clients | ForEach-Object { [string]$_.appVersion } | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Sort-Object -Unique)
$expectedFromMarker = if ($markerObject -and $markerObject.expectedVersion) { [string]$markerObject.expectedVersion } else { $ExpectedVersion }
$status = 'GEÇTİ'
$warnings = New-Object System.Collections.Generic.List[string]
if ($versions.Count -gt 1) {
  $status = 'DİKKAT'
  $warnings.Add("Birden çok HasarBotu sürümü kayıtlı: $($versions -join ', ')") | Out-Null
}
if ($clients.Count -eq 0) {
  $status = 'DİKKAT'
  $warnings.Add('Henüz kayıtlı bilgisayar yok. Her PC için -RegisterThisPC çalıştırılmalıdır.') | Out-Null
}
foreach ($client in $clients) {
  if ([string]$client.appVersion -ne $expectedFromMarker) {
    $status = 'DİKKAT'
    $warnings.Add("$($client.computer) v$($client.appVersion) kullanıyor; beklenen v$expectedFromMarker.") | Out-Null
  }
}

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$jsonPath = Join-Path $OutputDir "ofis-surum-kontrol-$stamp.json"
$mdPath = Join-Path $OutputDir "ofis-surum-kontrol-$stamp.md"
$result = [pscustomobject]@{
  status = $status
  rootPath = $root
  expectedVersion = $expectedFromMarker
  currentProjectVersion = $currentVersion
  officeStatusFolder = $officeDir
  createdAt = (Get-Date).ToString('s')
  registeredClientCount = $clients.Count
  versions = $versions
  warnings = $warnings
  clients = $clients
}
$result | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $jsonPath -Encoding UTF8

$lines = New-Object System.Collections.Generic.List[string]
$lines.Add('# HasarBotu Ofis Sürüm Kontrol Raporu') | Out-Null
$lines.Add('') | Out-Null
$lines.Add("- Durum: **$status**") | Out-Null
$lines.Add("- Beklenen sürüm: **v$expectedFromMarker**") | Out-Null
$lines.Add("- Bu proje klasörü sürümü: **v$currentVersion**") | Out-Null
$lines.Add('- K?k klas?r: `' + $root + '`') | Out-Null
$lines.Add('- Ofis s?r?m klas?r?: `' + $officeDir + '`') | Out-Null
$lines.Add('') | Out-Null
if ($warnings.Count -gt 0) {
  $lines.Add('## Uyarılar') | Out-Null
  foreach ($warning in $warnings) { $lines.Add("- $warning") | Out-Null }
  $lines.Add('') | Out-Null
}
$lines.Add('## Kayıtlı Bilgisayarlar') | Out-Null
$lines.Add('') | Out-Null
if ($clients.Count -eq 0) {
  $lines.Add('Kayıt yok.') | Out-Null
} else {
  $lines.Add('|Bilgisayar|Sürüm|Kullanıcı|Kayıt Zamanı|') | Out-Null
  $lines.Add('|---|---|---|---|') | Out-Null
  foreach ($client in $clients | Sort-Object computer) {
    $lines.Add("|$($client.computer)|v$($client.appVersion)|$($client.user)|$($client.recordedAt)|") | Out-Null
  }
}
$lines.Add('') | Out-Null
$lines.Add('## Standart Kullanım') | Out-Null
$lines.Add('') | Out-Null
$lines.Add('İlk PC veya yetkili PC hedef sürümü belirler ve kendisini kaydeder:') | Out-Null
$lines.Add('') | Out-Null
$lines.Add('```powershell') | Out-Null
$lines.Add('npm run live:version-check -- -RootPath "P:\BARAN GLOBAL EKSPERTİZ\2026" -ExpectedVersion ' + $currentVersion + ' -SetExpected -RegisterThisPC') | Out-Null
$lines.Add('```') | Out-Null
$lines.Add('') | Out-Null
$lines.Add('Diğer PC’lerde sadece kayıt alınır:') | Out-Null
$lines.Add('') | Out-Null
$lines.Add('```powershell') | Out-Null
$lines.Add('npm run live:version-check -- -RootPath "P:\BARAN GLOBAL EKSPERTİZ\2026" -RegisterThisPC') | Out-Null
$lines.Add('```') | Out-Null
$lines | Set-Content -LiteralPath $mdPath -Encoding UTF8

Write-Host "HasarBotu ofis sürüm kontrolü tamamlandı." -ForegroundColor Cyan
Write-Host "Durum: $status"
Write-Host "Beklenen sürüm: v$expectedFromMarker"
Write-Host "Rapor: $mdPath"
Write-Host "JSON : $jsonPath"
if ($clients.Count -gt 0) { $clients | Sort-Object computer | Format-Table computer, appVersion, user, recordedAt -AutoSize }
if ($status -ne 'GEÇTİ') { Write-Host 'Tüm PC’ler aynı sürümde olmadan canlı dağıtımı tamamlandı saymayın.' -ForegroundColor Yellow }

if (-not $NoPause) {
  Write-Host ''
  Read-Host 'Çıkmak için Enter'
}
