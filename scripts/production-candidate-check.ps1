param(
  [string]$RootPath = '',
  [string]$ExpectedVersion = '',
  [string]$ReleaseDir = (Join-Path (Resolve-Path (Join-Path $PSScriptRoot '..')) 'release'),
  [string]$OutputDir = (Join-Path (Resolve-Path (Join-Path $PSScriptRoot '..')) 'pilot-logs'),
  [switch]$NoPause,

  [switch]$SkipFreshBuild,
  [switch]$SkipReleaseAssets,
  [switch]$AllowWarnings
)

$ErrorActionPreference = 'Stop'
try {
  & chcp.com 65001 > $null
  [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
  $OutputEncoding = [System.Text.UTF8Encoding]::new($false)
} catch {}

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $projectRoot
if (-not (Test-Path -LiteralPath $OutputDir)) { New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null }

$packageJson = Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$currentVersion = [string]$packageJson.version
if ([string]::IsNullOrWhiteSpace($ExpectedVersion)) { $ExpectedVersion = $currentVersion }

$checks = New-Object System.Collections.Generic.List[object]
function Add-Check {
  param([string]$Name, [string]$Status, [string]$Detail)
  $script:checks.Add([pscustomobject]@{ name = $Name; status = $Status; detail = $Detail }) | Out-Null
}
function Test-File { param([string]$Path) return (Test-Path -LiteralPath $Path -PathType Leaf) }
function Test-Dir { param([string]$Path) return (Test-Path -LiteralPath $Path -PathType Container) }


if (-not $SkipFreshBuild) {
  try {
    Write-Host 'Fresh build kontrolü çalışıyor: npm run build' -ForegroundColor Cyan
    & npm.cmd run build
    if ($LASTEXITCODE -eq 0) { Add-Check 'Fresh source build' 'GEÇTİ' 'npm run build başarıyla tamamlandı.' }
    else { Add-Check 'Fresh source build' 'DİKKAT' "npm run build exitCode=$LASTEXITCODE" }
  } catch {
    Add-Check 'Fresh source build' 'DİKKAT' ("npm run build çalıştırılamadı: " + $_.Exception.Message)
  }
} else {
  Add-Check 'Fresh source build' 'DİKKAT' '-SkipFreshBuild kullanıldı; eski release klasörü yanıltıcı olabilir.'
}

Add-Check 'package.json sürümü' ($(if ($currentVersion -eq $ExpectedVersion) { 'GEÇTİ' } else { 'DİKKAT' })) "package=$currentVersion expected=$ExpectedVersion"
$constantsPath = Join-Path $projectRoot 'src/shared/constants.ts'
$constantsText = if (Test-File $constantsPath) { Get-Content -LiteralPath $constantsPath -Raw -Encoding UTF8 } else { '' }
Add-Check 'APP_VERSION uyumu' ($(if ($constantsText -like "*APP_VERSION = '$currentVersion'*" ) { 'GEÇTİ' } else { 'DİKKAT' })) "APP_VERSION v$currentVersion olmalı"

foreach ($doc in @('docs/GERI_DONUS_PLANI.md', 'docs/CANLI_KULLANIM_KILAVUZU.md', 'docs/OFIS_DAGITIM_KONTROL_LISTESI.md', 'docs/V0.4.0_PRODUCTION_CANDIDATE.md')) {
  Add-Check "Operasyon dokümanı: $doc" ($(if (Test-File (Join-Path $projectRoot $doc)) { 'GEÇTİ' } else { 'DİKKAT' })) $doc
}

if ($SkipReleaseAssets) {
  Add-Check 'Release asset kontrolü' 'DİKKAT' '-SkipReleaseAssets kullanıldı; EXE/SHA/release notes kontrolü atlandı. Bu aday tam Windows release kabulü değildir.'
} elseif (Test-Dir $ReleaseDir) {
  $installer = @(Get-ChildItem -LiteralPath $ReleaseDir -File -Filter "HasarBotu-Baran-Ekspertiz-Kurulum-$currentVersion.exe" -ErrorAction SilentlyContinue)
  $portable = @(Get-ChildItem -LiteralPath $ReleaseDir -File -Filter "HasarBotu-Baran-Ekspertiz-Tasinabilir-$currentVersion.exe" -ErrorAction SilentlyContinue)
  Add-Check 'Release EXE çıktısı' ($(if ($installer.Count -eq 1 -and $portable.Count -eq 1) { 'GEÇTİ' } else { 'HATA' })) "Kurulum=$($installer.Count), Tasinabilir=$($portable.Count)"
  Add-Check 'Release SHA-256 TXT' ($(if (Test-File (Join-Path $ReleaseDir 'RELEASE_HASHES_SHA256.txt')) { 'GEÇTİ' } else { 'HATA' })) (Join-Path $ReleaseDir 'RELEASE_HASHES_SHA256.txt')
  Add-Check 'Release SHA-256 JSON' ($(if (Test-File (Join-Path $ReleaseDir 'RELEASE_HASHES_SHA256.json')) { 'GEÇTİ' } else { 'HATA' })) (Join-Path $ReleaseDir 'RELEASE_HASHES_SHA256.json')
  Add-Check 'Release notes' ($(if (Test-File (Join-Path $ReleaseDir "RELEASE_NOTES_v$currentVersion.md")) { 'GEÇTİ' } else { 'HATA' })) (Join-Path $ReleaseDir "RELEASE_NOTES_v$currentVersion.md")
} else {
  Add-Check 'Release klasörü' 'HATA' "Release klasörü yok: $ReleaseDir. EXE build sonrası tekrar çalıştırın veya bilinçli atlamak için -SkipReleaseAssets kullanın."
}

if (-not [string]::IsNullOrWhiteSpace($RootPath)) {
  $rootOk = Test-Dir $RootPath
  Add-Check 'Canlı kök klasör' ($(if ($rootOk) { 'GEÇTİ' } else { 'DİKKAT' })) $RootPath
  if ($rootOk) {
    $root = (Resolve-Path -LiteralPath $RootPath).Path
    $officeDir = Join-Path $root '_HASARBOTU_OFFICE'
    $markerPath = Join-Path $officeDir 'office-version.json'
    $clientsDir = Join-Path $officeDir 'clients'
    $expectedFromOffice = ''
    if (Test-File $markerPath) {
      try {
        $marker = Get-Content -LiteralPath $markerPath -Raw -Encoding UTF8 | ConvertFrom-Json
        $expectedFromOffice = [string]$marker.expectedVersion
      } catch {}
    }
    Add-Check 'Ofis hedef sürüm kaydı' ($(if ($expectedFromOffice -eq $ExpectedVersion) { 'GEÇTİ' } else { 'DİKKAT' })) "office=$expectedFromOffice expected=$ExpectedVersion"
    $clients = @()
    if (Test-Dir $clientsDir) {
      Get-ChildItem -LiteralPath $clientsDir -File -Filter '*.json' -ErrorAction SilentlyContinue | ForEach-Object {
        try { $clients += (Get-Content -LiteralPath $_.FullName -Raw -Encoding UTF8 | ConvertFrom-Json) } catch {}
      }
    }
    $versions = @($clients | ForEach-Object { [string]$_.appVersion } | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Sort-Object -Unique)
    $bad = @($clients | Where-Object { [string]$_.appVersion -ne $ExpectedVersion })
    Add-Check 'Ofis PC sürüm kayıtları' ($(if ($clients.Count -gt 0 -and $bad.Count -eq 0 -and $versions.Count -eq 1) { 'GEÇTİ' } else { 'DİKKAT' })) "clients=$($clients.Count) versions=$($versions -join ',')"
  }
}

$latestPreflight = @(Get-ChildItem -LiteralPath $OutputDir -File -Filter 'canli-on-kontrol-*.json' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1)
if ($latestPreflight.Count -eq 1) {
  try {
    $preflight = Get-Content -LiteralPath $latestPreflight[0].FullName -Raw -Encoding UTF8 | ConvertFrom-Json
    Add-Check 'Son live:preflight raporu' ($(if ([string]$preflight.status -eq 'GEÇTİ') { 'GEÇTİ' } else { 'DİKKAT' })) "$($latestPreflight[0].Name) status=$($preflight.status)"
  } catch { Add-Check 'Son live:preflight raporu' 'DİKKAT' "Okunamadı: $($latestPreflight[0].FullName)" }
} else {
  Add-Check 'Son live:preflight raporu' 'DİKKAT' "pilot-logs içinde canli-on-kontrol-*.json yok. Önce npm run live:preflight çalıştırın."
}

$latestBackup = @(Get-ChildItem -LiteralPath $OutputDir -File -Filter '*backup*.zip' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1)
if ($latestBackup.Count -eq 1) {
  Add-Check 'Takip yedeği' 'GEÇTİ' $latestBackup[0].FullName
} else {
  Add-Check 'Takip yedeği' 'DİKKAT' 'Bu denetim otomatik yedek ZIP bulamadı. live:backup-tracking çıktısını ayrıca saklayın.'
}

$hardFailures = @($checks | Where-Object { $_.status -eq 'HATA' })
$warnings = @($checks | Where-Object { $_.status -eq 'DİKKAT' })
$status = if ($hardFailures.Count -gt 0) { 'HATA' } elseif ($warnings.Count -gt 0) { 'DİKKAT' } else { 'GEÇTİ' }
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$jsonPath = Join-Path $OutputDir "production-candidate-check-$stamp.json"
$mdPath = Join-Path $OutputDir "production-candidate-check-$stamp.md"
$result = [pscustomobject]@{ status = $status; version = $currentVersion; expectedVersion = $ExpectedVersion; createdAt = (Get-Date).ToString('s'); checks = $checks }
$result | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $jsonPath -Encoding UTF8

$lines = New-Object System.Collections.Generic.List[string]
$lines.Add('# HasarBotu Production Candidate Kontrol Raporu') | Out-Null
$lines.Add('') | Out-Null
$lines.Add("- Durum: **$status**") | Out-Null
$lines.Add("- Sürüm: **v$currentVersion**") | Out-Null
$lines.Add("- Beklenen: **v$ExpectedVersion**") | Out-Null
$lines.Add('') | Out-Null
$lines.Add('|Kontrol|Durum|Detay|') | Out-Null
$lines.Add('|---|---|---|') | Out-Null
foreach ($check in $checks) { $lines.Add("|$($check.name)|$($check.status)|$([string]$check.detail -replace '\|','/')|") | Out-Null }
$lines.Add('') | Out-Null
$lines.Add('## Karar') | Out-Null
$lines.Add('') | Out-Null
if ($status -eq 'GEÇTİ') {
  $lines.Add('Kaynak/release/operasyon kayıtları Production Candidate için hazır görünüyor. Yine de 3 PC canlı denemesi ve bağımsız Claude/Fable raporu manuel kabul şartıdır.') | Out-Null
} else {
  $lines.Add('Üretim adayı sabitlenmeden önce DİKKAT maddeleri tamamlanmalı veya yazılı olarak açıklanmalıdır.') | Out-Null
}
$lines | Set-Content -LiteralPath $mdPath -Encoding UTF8

Write-Host "Production Candidate kontrol raporu oluşturuldu: $status" -ForegroundColor ($(if ($status -eq 'GEÇTİ') { 'Green' } else { 'Yellow' }))
Write-Host $mdPath
Write-Host $jsonPath
if (-not $NoPause) {
  Write-Host ''
  Read-Host 'Çıkmak için Enter'
}
if ($hardFailures.Count -gt 0) { exit 1 }
