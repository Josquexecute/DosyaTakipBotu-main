$ErrorActionPreference = "Stop"
try {
  & chcp.com 65001 > $null
  [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
  $OutputEncoding = [System.Text.UTF8Encoding]::new($false)
} catch {}

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$packageJsonPath = Join-Path $root "package.json"
if (-not (Test-Path $packageJsonPath)) {
  throw "package.json bulunamadı: $packageJsonPath"
}

$packageJson = Get-Content -LiteralPath $packageJsonPath -Raw -Encoding UTF8 | ConvertFrom-Json
$electronVersion = [string]$packageJson.devDependencies.electron
if ([string]::IsNullOrWhiteSpace($electronVersion)) {
  throw "package.json içinde devDependencies.electron bulunamadı."
}
if ($electronVersion.StartsWith("^") -or $electronVersion.StartsWith("~") -or $electronVersion.Contains(" ")) {
  throw "Electron sürümü sabit/pin olmalı. Gelen: $electronVersion"
}

$arch = "win32-x64"
$zipName = "electron-v$electronVersion-$arch.zip"
$url = "https://github.com/electron/electron/releases/download/v$electronVersion/$zipName"
$electronModule = Join-Path $root "node_modules\electron"
$dist = Join-Path $electronModule "dist"
$pathTxt = Join-Path $electronModule "path.txt"
$tempDir = Join-Path $root ".tmp-electron-win"
$zipPath = Join-Path $tempDir $zipName

Write-Host "HasarBotu Electron Windows çalıştırılabilir dosya düzeltmesi başlıyor..." -ForegroundColor Cyan
Write-Host "Sürüm: $electronVersion / $arch"

if (-not (Test-Path $electronModule)) {
  throw "node_modules\electron bulunamadı. Önce 'npm install' veya 'npm ci --ignore-scripts --include=dev --no-audit --no-fund' çalıştırın."
}

if (Test-Path $tempDir) { Remove-Item $tempDir -Recurse -Force }
New-Item -ItemType Directory -Force -Path $tempDir | Out-Null

Write-Host "Electron indiriliyor: $url"
try {
  Invoke-WebRequest -Uri $url -OutFile $zipPath -UseBasicParsing
} catch {
  throw "Electron indirilemedi. İnternet bağlantısını, proxy/VPN/WireSock ayarlarını ve GitHub erişimini kontrol edin. Hata: $($_.Exception.Message)"
}

if (Test-Path $dist) { Remove-Item $dist -Recurse -Force }
New-Item -ItemType Directory -Force -Path $dist | Out-Null

Write-Host "Electron çıkarılıyor..."
Expand-Archive -LiteralPath $zipPath -DestinationPath $dist -Force

# Electron npm paketi path.txt değerini trim etmeden okur. Bu dosyada satır sonu olursa
# Electron komut satırı aracı electron.exe yolunu çalıştırmaya çalışır ve ENOENT verir.
[System.IO.File]::WriteAllText($pathTxt, "electron.exe", [System.Text.Encoding]::ASCII)

$electronExe = Join-Path $dist "electron.exe"
if (-not (Test-Path $electronExe)) { throw "electron.exe doğrulanamadı: $electronExe" }
if (-not (Test-Path $pathTxt)) { throw "path.txt oluşturulamadı: $pathTxt" }
$content = [System.IO.File]::ReadAllText($pathTxt, [System.Text.Encoding]::ASCII)
if ($content -ne "electron.exe") {
  $visible = $content.Replace("`r", "<CR>").Replace("`n", "<LF>")
  throw "path.txt içeriği hatalı. Beklenen: electron.exe / Gelen: $visible"
}

Remove-Item $tempDir -Recurse -Force
Write-Host "Tamam: Electron Windows çalıştırılabilir dosyası düzeltildi." -ForegroundColor Green
