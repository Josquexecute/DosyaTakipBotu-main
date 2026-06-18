param(
  [switch]$SkipInstall
)

$ErrorActionPreference = 'Stop'

function Test-Command($Name) {
  $cmd = Get-Command $Name -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  return ''
}

function Test-File($Path) {
  if ([string]::IsNullOrWhiteSpace($Path)) { return $false }
  return Test-Path -LiteralPath $Path -PathType Leaf
}

function Find-Tesseract {
  $fromPath = Test-Command 'tesseract.exe'
  if ($fromPath) { return $fromPath }
  $known = @(
    'C:\Program Files\Tesseract-OCR\tesseract.exe',
    'C:\Program Files (x86)\Tesseract-OCR\tesseract.exe'
  )
  foreach ($candidate in $known) {
    if (Test-File $candidate) { return $candidate }
  }
  return ''
}

function Find-PdfToPpm {
  $fromPath = Test-Command 'pdftoppm.exe'
  if ($fromPath) { return $fromPath }
  $known = @(
    'C:\Program Files\poppler\Library\bin\pdftoppm.exe',
    'C:\Program Files\poppler\bin\pdftoppm.exe',
    'C:\Program Files\Poppler\Library\bin\pdftoppm.exe',
    'C:\Program Files\Poppler\bin\pdftoppm.exe'
  )
  foreach ($candidate in $known) {
    if (Test-File $candidate) { return $candidate }
  }
  $wingetRoot = Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Packages'
  if (Test-Path -LiteralPath $wingetRoot -PathType Container) {
    $wingetCandidate = Get-ChildItem -Path $wingetRoot -Recurse -Filter 'pdftoppm.exe' -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($wingetCandidate) { return $wingetCandidate.FullName }
  }
  return ''
}

function Install-WingetPackage($PackageId, $Label) {
  $winget = Test-Command 'winget.exe'
  if (-not $winget) {
    Write-Warning "winget bulunamadı; $Label otomatik kurulamadı."
    return
  }
  Write-Host "$Label kuruluyor: $PackageId"
  & $winget install --id $PackageId --exact --accept-source-agreements --accept-package-agreements --silent
}

Write-Host 'HasarBotu OCR kontrolü başlıyor...'

$tesseract = Find-Tesseract
$pdftoppm = Find-PdfToPpm

if (-not $SkipInstall) {
  if (-not $tesseract) {
    Install-WingetPackage 'UB-Mannheim.TesseractOCR' 'Tesseract OCR'
    $tesseract = Find-Tesseract
  }
  if (-not $pdftoppm) {
    Install-WingetPackage 'oschwartz10612.Poppler' 'Poppler PDF araçları'
    $pdftoppm = Find-PdfToPpm
  }
}

if ($tesseract) {
  Write-Host "Tesseract bulundu: $tesseract"
  & $tesseract --version | Select-Object -First 1
} else {
  Write-Warning 'Tesseract bulunamadı. Görsel OCR çalışmaz.'
}

if ($pdftoppm) {
  Write-Host "pdftoppm bulundu: $pdftoppm"
  $previousErrorAction = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $pdfVersion = & $pdftoppm -v 2>&1 | Select-Object -First 1
  $ErrorActionPreference = $previousErrorAction
  if ($pdfVersion) { Write-Host $pdfVersion }
} else {
  Write-Warning 'pdftoppm bulunamadı. Taranmış PDF OCR çalışmaz.'
}

if ($tesseract -and $pdftoppm) {
  Write-Host 'OCR hazır: Tesseract + Poppler kullanılabilir.'
  exit 0
}

Write-Warning 'OCR eksik kaldı. Program çalışır, ancak taranmış PDF/görsel metni otomatik okunamaz.'
exit 1
