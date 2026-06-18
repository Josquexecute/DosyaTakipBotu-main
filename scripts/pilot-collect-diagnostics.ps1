param(
  [string]$OutputDir = (Join-Path (Resolve-Path (Join-Path $PSScriptRoot '..')) 'pilot-logs'),
  [switch]$IncludeCacheIndex,
  [switch]$IncludeRelease,
  [switch]$NoPause
)

$ErrorActionPreference = "Stop"
try {
  & chcp.com 65001 > $null
  [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
  $OutputEncoding = [System.Text.UTF8Encoding]::new($false)
} catch {}

$root = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location $root
if (-not (Test-Path -LiteralPath $OutputDir)) { New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null }

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$workDir = Join-Path $OutputDir "pilot-diagnostics-$stamp"
$zipPath = Join-Path $OutputDir "pilot-diagnostics-$stamp.zip"
New-Item -ItemType Directory -Force -Path $workDir | Out-Null

function Copy-IfExists {
  param([string]$Path, [string]$TargetName)
  if (Test-Path -LiteralPath $Path) {
    Copy-Item -LiteralPath $Path -Destination (Join-Path $workDir $TargetName) -Force -Recurse
  }
}

function Add-TextFile {
  param([string]$Name, [string]$Content)
  Set-Content -LiteralPath (Join-Path $workDir $Name) -Value $Content -Encoding UTF8
}

$packageJson = Get-Content -LiteralPath (Join-Path $root 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$electronPathTxt = Join-Path $root 'node_modules\electron\path.txt'
$electronPathTxtValue = if (Test-Path -LiteralPath $electronPathTxt) { [System.IO.File]::ReadAllText($electronPathTxt, [System.Text.Encoding]::ASCII) } else { '<yok>' }
$appCache = Join-Path $env:APPDATA 'Baran Ekspertiz\local-cache'
$appLogs = Join-Path $appCache 'logs'

$nodeVersion = (& node --version 2>$null) -join "`n"
$npmVersion = (& npm --version 2>$null) -join "`n"

$system = @"
HasarBotu Pilot Tanı Özeti
==========================
Toplanma zamanı       : $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
Proje kökü            : $root
Paket sürümü          : $($packageJson.version)
Electron sürümü       : $($packageJson.devDependencies.electron)
Node                  : $nodeVersion
npm                   : $npmVersion
Bilgisayar            : $env:COMPUTERNAME
Kullanıcı             : $env:USERNAME
Windows               : $([Environment]::OSVersion.VersionString)
PowerShell            : $($PSVersionTable.PSVersion)
APPDATA cache         : $appCache
Electron path.txt     : $electronPathTxtValue

Not: Bu paket canlı pCloud dosya içeriklerini toplamaz. Varsayılan olarak sadece proje logları,
uygulama logları ve temel ayar/tanı dosyaları alınır. Dosya indeksleri için -IncludeCacheIndex kullanılır.
"@
Add-TextFile 'SISTEM_OZETI.txt' $system

Copy-IfExists (Join-Path $root 'package.json') 'package.json'
Copy-IfExists (Join-Path $root 'package-lock.json') 'package-lock.json'
Copy-IfExists (Join-Path $root 'TESLIM_RAPORU.md') 'TESLIM_RAPORU.md'
Copy-IfExists (Join-Path $root 'SIRADAKI_SUREC_TESLIM.md') 'SIRADAKI_SUREC_TESLIM.md'
Copy-IfExists (Join-Path $root 'HOTFIX_FIX_ELECTRON_RAPORU.md') 'HOTFIX_FIX_ELECTRON_RAPORU.md'
Copy-IfExists (Join-Path $root 'SAHA_PILOT_TESLIM_RAPORU.md') 'SAHA_PILOT_TESLIM_RAPORU.md'
Copy-IfExists (Join-Path $root 'docs\PILOT_KABUL_PLANI.md') 'PILOT_KABUL_PLANI.md'
Copy-IfExists (Join-Path $root 'docs\PILOT_SAHA_TEST_FORMU.md') 'PILOT_SAHA_TEST_FORMU.md'
Copy-IfExists (Join-Path $root 'docs\CANLI_GECIS_KARARI.md') 'CANLI_GECIS_KARARI.md'

if (Test-Path -LiteralPath (Join-Path $root 'pilot-logs')) {
  New-Item -ItemType Directory -Force -Path (Join-Path $workDir 'pilot-logs') | Out-Null
  Get-ChildItem -LiteralPath (Join-Path $root 'pilot-logs') -File -Filter '*.log' | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $workDir 'pilot-logs') -Force
  }
}

if (Test-Path -LiteralPath $appLogs) {
  Copy-Item -LiteralPath $appLogs -Destination (Join-Path $workDir 'app-logs') -Recurse -Force
}

Copy-IfExists (Join-Path $appCache 'app-settings.json') 'app-settings.json'
Copy-IfExists (Join-Path $appCache 'scan-state.json') 'scan-state.json'

if ($IncludeCacheIndex) {
  Copy-IfExists (Join-Path $appCache 'year-2026-index.json') 'year-2026-index.json'
  Copy-IfExists (Join-Path $appCache 'folder-fingerprints.json') 'folder-fingerprints.json'
}

if ($IncludeRelease -and (Test-Path -LiteralPath (Join-Path $root 'release'))) {
  Get-ChildItem -LiteralPath (Join-Path $root 'release') -Recurse | Select-Object FullName, Length, LastWriteTime | Format-Table -AutoSize | Out-String | Set-Content -LiteralPath (Join-Path $workDir 'release-liste.txt') -Encoding UTF8
}

Compress-Archive -LiteralPath (Join-Path $workDir '*') -DestinationPath $zipPath -Force
Remove-Item -LiteralPath $workDir -Recurse -Force

Write-Host "Tamam: Pilot tanı paketi oluşturuldu." -ForegroundColor Green
Write-Host $zipPath
Write-Host "Sorun bildirirken bu ZIP'i paylaşın."

if (-not $NoPause) {
  Write-Host ""
  Read-Host "Çıkmak için Enter"
}
