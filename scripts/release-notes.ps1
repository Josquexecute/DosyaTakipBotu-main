param(
  [string]$ReleaseDir = (Join-Path (Resolve-Path (Join-Path $PSScriptRoot '..')) 'release'),
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
$version = [string]$packageJson.version
$release = (Resolve-Path -LiteralPath $ReleaseDir).Path
$hashJson = Join-Path $release 'RELEASE_HASHES_SHA256.json'
if (-not (Test-Path -LiteralPath $hashJson -PathType Leaf)) {
  & (Join-Path $PSScriptRoot 'release-hash.ps1') -ReleaseDir $release -NoPause
  if (-not (Test-Path -LiteralPath $hashJson -PathType Leaf)) {
    throw "Release hash JSON oluşturulamadı: $hashJson"
  }
}
$hashes = Get-Content -LiteralPath $hashJson -Raw -Encoding UTF8 | ConvertFrom-Json
$notesPath = Join-Path $release "RELEASE_NOTES_v$version.md"

$lines = New-Object System.Collections.Generic.List[string]
$lines.Add("# HasarBotu v$version Production Candidate Release Notları") | Out-Null
$lines.Add('') | Out-Null
$lines.Add('## Amaç') | Out-Null
$lines.Add('') | Out-Null
$lines.Add('Bu sürüm hotfix serisinin sabitlenmiş üretim adayıdır. v0.3.13–v0.3.18 arasındaki veri güvenliği, Windows/ofis dağıtımı, pCloud performansı, dashboard doğruluğu, Excel üretkenliği ve davranış testi paketleri bu sürümde birleştirilmiştir.') | Out-Null
$lines.Add('') | Out-Null
$lines.Add('## Üretim Adayı Kabul Notu') | Out-Null
$lines.Add('') | Out-Null
$lines.Add('Bu release kaynak kod ve EXE üretim paketidir. Canlı ofis sabitlemesi için aşağıdaki saha kabul maddeleri ayrıca tamamlanmalıdır:') | Out-Null
$lines.Add('') | Out-Null
$lines.Add('- Windows `npm run pilot:windows -- -BuildExe` logu temiz olmalı.') | Out-Null
$lines.Add('- `npm run live:backup-tracking` ile takip yedeği alınmalı.') | Out-Null
$lines.Add('- `npm run live:preflight` raporu temiz olmalı veya tüm uyarılar açıklanmış olmalı.') | Out-Null
$lines.Add('- `npm run live:version-check` ile tüm PC kayıtları aynı v' + $version + ' sürümünü göstermeli.') | Out-Null
$lines.Add('- Claude/Fable yeni bağımsız raporunda P0/P1 kritik bulgu kalmamalı.') | Out-Null
$lines.Add('') | Out-Null
$lines.Add('## SHA-256') | Out-Null
$lines.Add('') | Out-Null
$lines.Add('|Dosya|SHA-256|') | Out-Null
$lines.Add('|---|---|') | Out-Null
foreach ($item in @($hashes)) { $lines.Add("|$($item.file)|`$($item.sha256)`|") | Out-Null }
$lines.Add('') | Out-Null
$lines.Add('## Windows Kabul Komutları') | Out-Null
$lines.Add('') | Out-Null
$lines.Add('```powershell') | Out-Null
$lines.Add('npm run pilot:windows -- -BuildExe') | Out-Null
$lines.Add('npm run live:backup-tracking -- -RootPath "P:\BARAN GLOBAL EKSPERTİZ\2026"') | Out-Null
$lines.Add('npm run live:preflight -- -RootPath "P:\BARAN GLOBAL EKSPERTİZ\2026"') | Out-Null
$lines.Add('npm run live:version-check -- -RootPath "P:\BARAN GLOBAL EKSPERTİZ\2026" -ExpectedVersion ' + $version + ' -SetExpected -RegisterThisPC') | Out-Null
$lines.Add('npm run release:candidate-check -- -RootPath "P:\BARAN GLOBAL EKSPERTİZ\2026"') | Out-Null
$lines.Add('```') | Out-Null
$lines.Add('') | Out-Null
$lines.Add('## Rollback') | Out-Null
$lines.Add('') | Out-Null
$lines.Add('Geri dönüş gerektiğinde `_HASARBOTU` klasörleri silinmez. Önce uygulamalar kapatılır, önceki EXE kurulur ve yalnızca ilgili plaka klasörünün takip yedeği geri alınır. Önceki EXE ve son takip yedeği release öncesi ayrıca saklanmalıdır.') | Out-Null
$lines | Set-Content -LiteralPath $notesPath -Encoding UTF8

Write-Host 'Production Candidate release notları oluşturuldu.' -ForegroundColor Green
Write-Host $notesPath
if (-not $NoPause) {
  Write-Host ''
  Read-Host 'Çıkmak için Enter'
}
