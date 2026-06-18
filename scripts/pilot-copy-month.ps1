param(
  [Parameter(Mandatory = $true)]
  [string]$SourcePath,

  [string]$DestinationRoot = (Join-Path ([Environment]::GetFolderPath('Desktop')) 'HasarBotu-Pilot-Kopyalari'),

  [string]$Name = '',

  [switch]$NoPause
)

$ErrorActionPreference = "Stop"
try {
  & chcp.com 65001 > $null
  [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
  $OutputEncoding = [System.Text.UTF8Encoding]::new($false)
} catch {}

function Convert-SafeName {
  param([string]$Value)
  $safe = $Value -replace '[\\/:*?"<>|]', '-'
  $safe = $safe.Trim()
  if ([string]::IsNullOrWhiteSpace($safe)) { return 'pilot-kopya' }
  return $safe
}

$source = (Resolve-Path -LiteralPath $SourcePath).Path
if (-not (Test-Path -LiteralPath $source -PathType Container)) {
  throw "Kaynak klasör bulunamadı veya klasör değil: $SourcePath"
}

if (-not (Test-Path -LiteralPath $DestinationRoot)) {
  New-Item -ItemType Directory -Force -Path $DestinationRoot | Out-Null
}

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$leaf = if ([string]::IsNullOrWhiteSpace($Name)) { Split-Path -Path $source -Leaf } else { $Name }
$destName = "$(Convert-SafeName $leaf)-pilot-$stamp"
$destination = Join-Path $DestinationRoot $destName
New-Item -ItemType Directory -Force -Path $destination | Out-Null

$logFile = Join-Path $destination 'PILOT_KOPYA_ROBOCOPY.log'
$infoFile = Join-Path $destination 'PILOT_KOPYA_BILGI.txt'

Write-Host "HasarBotu pilot kopyası oluşturuluyor..." -ForegroundColor Cyan
Write-Host "Kaynak: $source"
Write-Host "Hedef:  $destination"
Write-Host ""
Write-Host "Güvenlik: Bu komut /MIR kullanmaz, kaynak klasörden dosya silmez." -ForegroundColor Yellow

& robocopy $source $destination /E /XJ /R:1 /W:1 /COPY:DAT /DCOPY:DAT /TEE /LOG:$logFile
$code = $LASTEXITCODE
if ($code -gt 7) {
  throw "Robocopy başarısız oldu. Çıkış kodu: $code. Log: $logFile"
}

@"
HasarBotu Pilot Kopya Bilgisi
=============================
Oluşturma zamanı : $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
Kaynak klasör    : $source
Pilot kopya      : $destination
Robocopy kodu    : $code

Bu klasör canlı pCloud verisi yerine pilot testte kullanılmak üzere oluşturuldu.
Kaynak klasörde dosya silme veya taşıma yapılmadı. Robocopy /MIR kullanılmadı.

Uygulamada ana klasör olarak bu pilot kopyayı seçin.
"@ | Set-Content -LiteralPath $infoFile -Encoding UTF8

Write-Host ""
Write-Host "Tamam: Pilot kopya oluşturuldu." -ForegroundColor Green
Write-Host $destination
Write-Host "Bilgi dosyası: $infoFile"
Write-Host "Log dosyası:   $logFile"

if (-not $NoPause) {
  Write-Host ""
  Read-Host "Çıkmak için Enter"
}
