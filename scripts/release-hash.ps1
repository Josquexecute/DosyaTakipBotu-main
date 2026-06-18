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

function Get-HasarBotuSha256Hex {
  param(
    [Parameter(Mandatory = $true)]
    [string]$LiteralPath
  )

  $resolved = (Resolve-Path -LiteralPath $LiteralPath).Path
  $cmd = Get-Command -Name Get-FileHash -ErrorAction SilentlyContinue
  if ($null -ne $cmd) {
    $nativeHash = Get-FileHash -LiteralPath $resolved -Algorithm SHA256
    return ([string]$nativeHash.Hash).ToLowerInvariant()
  }

  # GitHub Actions veya eski/minimal Windows PowerShell ortamlarında Get-FileHash
  # kullanılamayabilir. Bu fallback aynı SHA256 değerini .NET üzerinden üretir.
  $sha = [System.Security.Cryptography.SHA256]::Create()
  $stream = [System.IO.File]::Open($resolved, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
  try {
    $bytes = $sha.ComputeHash($stream)
  } finally {
    $stream.Dispose()
    if ($sha -is [System.IDisposable]) { $sha.Dispose() }
  }

  return (-join ($bytes | ForEach-Object { $_.ToString('x2') }))
}

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$packageJson = Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$version = [string]$packageJson.version
$release = (Resolve-Path -LiteralPath $ReleaseDir).Path
$installer = @(Get-ChildItem -LiteralPath $release -File -Filter "HasarBotu-Baran-Ekspertiz-Kurulum-$version.exe" -ErrorAction SilentlyContinue)
$portable = @(Get-ChildItem -LiteralPath $release -File -Filter "HasarBotu-Baran-Ekspertiz-Tasinabilir-$version.exe" -ErrorAction SilentlyContinue)
if ($installer.Count -ne 1 -or $portable.Count -ne 1) {
  throw "Release klasorunde v$version icin tam 1 kurulum ve 1 tasinabilir EXE bekleniyor. Kurulum=$($installer.Count), Tasinabilir=$($portable.Count)"
}
$files = @()
$files += $installer
$files += $portable

$hashes = foreach ($file in $files | Sort-Object Name) {
  $hash = Get-HasarBotuSha256Hex -LiteralPath $file.FullName
  [pscustomobject]@{
    file = $file.Name
    path = $file.FullName
    sizeBytes = $file.Length
    sha256 = $hash
  }
}

$textPath = Join-Path $release 'RELEASE_HASHES_SHA256.txt'
$jsonPath = Join-Path $release 'RELEASE_HASHES_SHA256.json'
$lines = foreach ($item in $hashes) { "$($item.sha256)  $($item.file)" }
$lines | Set-Content -LiteralPath $textPath -Encoding UTF8
$hashes | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $jsonPath -Encoding UTF8

Write-Host 'Release SHA-256 hashleri oluşturuldu.' -ForegroundColor Green
Write-Host $textPath
Write-Host $jsonPath
$hashes | Format-Table file, sha256 -AutoSize

if (-not $NoPause) {
  Write-Host ''
  Read-Host 'Çıkmak için Enter'
}
