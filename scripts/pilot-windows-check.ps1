param(
  [switch]$SkipInstall,
  [switch]$BuildExe,
  [switch]$NoPause
)

$ErrorActionPreference = "Stop"
try {
  & chcp.com 65001 > $null
  [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
  $OutputEncoding = [System.Text.UTF8Encoding]::new($false)
} catch {}

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $root

$packageJson = Get-Content -LiteralPath (Join-Path $root "package.json") -Raw -Encoding UTF8 | ConvertFrom-Json
$version = [string]$packageJson.version
$logDir = Join-Path $root "pilot-logs"
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Force -Path $logDir | Out-Null }
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$logFile = Join-Path $logDir "pilot-windows-$stamp.log"

function Write-LogLine {
  param([string]$Message)
  $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $Message"
  Write-Host $line
  Add-Content -LiteralPath $logFile -Value $line -Encoding UTF8
}

function Invoke-Step {
  param(
    [string]$Name,
    [scriptblock]$Command
  )
  Write-LogLine "BAŞLA - $Name"

  # npm ve electron-builder gibi native Windows komutları bazı uyarıları stderr'e yazar.
  # PowerShell'de `$ErrorActionPreference = "Stop"` aktifken bu uyarılar gerçek hata
  # olmasa bile catch bloğuna düşebilir. Bu yüzden bu adımda başarı/başarısızlık
  # yalnızca exit code ile belirlenir; stdout/stderr yine log dosyasına yazılır.
  $previousErrorActionPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = "Continue"
    $global:LASTEXITCODE = 0
    $output = & $Command 2>&1
    $exitCode = $LASTEXITCODE

    foreach ($line in $output) {
      $text = [string]$line
      Write-Host $text
      Add-Content -LiteralPath $logFile -Value $text -Encoding UTF8
    }

    if ($null -ne $exitCode -and $exitCode -ne 0) {
      throw "$Name komutu $exitCode koduyla bitti."
    }

    Write-LogLine "TAMAM - $Name"
  } catch {
    Write-LogLine "HATA - $Name - $($_.Exception.Message)"
    throw
  } finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }
}

try {
  Write-LogLine "HasarBotu Windows pilot kabul kontrolü başlıyor. Sürüm: $version"
  Write-LogLine "Kök klasör: $root"
  Write-LogLine "Log: $logFile"

  if (-not $SkipInstall) {
    Invoke-Step "Bağımlılıkları temiz kur" { npm.cmd ci --ignore-scripts --include=dev --no-audit --no-fund }
  } else {
    Write-LogLine "ATLANDI - Bağımlılık kurulumu (-SkipInstall)"
  }

  Invoke-Step "Electron Windows binary düzeltmesi" { npm.cmd run fix:electron }
  Invoke-Step "Electron binary kontrolü" { npm.cmd run check:electron }
  Invoke-Step "Proje doğrulama" { npm.cmd run verify }
  Invoke-Step "Duman testi" { npm.cmd run smoke }
  Invoke-Step "Özellik denetimi" { npm.cmd run feature:audit }
  Invoke-Step "Türkçe arayüz denetimi" { npm.cmd run audit:turkish }
  Invoke-Step "Windows uyumluluk denetimi" { npm.cmd run compat:windows }
  Invoke-Step "TypeScript typecheck" { npm.cmd run typecheck }
  Invoke-Step "Build" { npm.cmd run build }
  Invoke-Step "Renderer stabilite denetimi" { npm.cmd run audit:renderer-stability }
  Invoke-Step "Günlük iş masası denetimi" { npm.cmd run audit:daily-work }
  Invoke-Step "Saha pilot v2 denetimi" { npm.cmd run audit:field-pilot-v2 }
  Invoke-Step "Ofis final audit" { npm.cmd run final:audit }

  if ($BuildExe) {
    Invoke-Step "Eski release çıktıları temizliği" {
      $releaseDir = Join-Path $root "release"
      if (Test-Path -LiteralPath $releaseDir) {
        Remove-Item -LiteralPath $releaseDir -Recurse -Force
      }
    }
    Invoke-Step "Windows EXE üretimi" { npm.cmd run dist:win }
    Invoke-Step "Release SHA-256 hash üretimi" { npm.cmd run release:hash -- -NoPause }
    Invoke-Step "Release notları üretimi" { npm.cmd run release:notes -- -NoPause }
    Invoke-Step "Release çıktıları listeleme" {
      Get-ChildItem -LiteralPath (Join-Path $root "release") -Recurse |
        Select-Object FullName, Length, LastWriteTime |
        ForEach-Object { "$($_.FullName) | $($_.Length) bytes | $($_.LastWriteTime)" }
    }
  } else {
    Write-LogLine "ATLANDI - EXE üretimi. EXE istiyorsanız: npm run pilot:windows -- -BuildExe"
  }

  Write-LogLine "PİLOT KABUL KONTROLÜ TAMAMLANDI."
  Write-Host ""
  Write-Host "Sonraki manuel adımlar:" -ForegroundColor Cyan
  Write-Host "1. npm start ile uygulamayı açın."
  Write-Host "2. Canlı pCloud yerine gerçek ay klasörü kopyasını seçin."
  Write-Host "3. docs/PILOT_KABUL_PLANI.md içindeki tek/iki/üç bilgisayar senaryolarını uygulayın."
  Write-Host "4. Sorun varsa bu log dosyasını saklayın: $logFile"
} catch {
  Write-Host ""
  Write-Host "PİLOT KABUL KONTROLÜ HATA İLE DURDU." -ForegroundColor Red
  Write-Host "Log dosyası: $logFile" -ForegroundColor Yellow
  Write-Host "Tanı paketi toplamak için: npm run pilot:collect" -ForegroundColor Yellow
  throw
} finally {
  if (-not $NoPause) {
    Write-Host ""
    Read-Host "Çıkmak için Enter"
  }
}
