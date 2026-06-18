param(
  [Parameter(Mandatory = $true)]
  [string]$RootPath,

  [string]$OutputDir = (Join-Path ([Environment]::GetFolderPath('Desktop')) 'HasarBotu-Canli-Yedekleri'),

  [switch]$IncludeTxtReports,

  [switch]$NoPause
)

$ErrorActionPreference = "Stop"
try {
  & chcp.com 65001 > $null
  [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
  $OutputEncoding = [System.Text.UTF8Encoding]::new($false)
} catch {}

$root = (Resolve-Path -LiteralPath $RootPath).Path
if (-not (Test-Path -LiteralPath $root -PathType Container)) {
  throw "Yedeklenecek klasör bulunamadı veya klasör değil: $RootPath"
}

if (-not (Test-Path -LiteralPath $OutputDir)) { New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null }
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$workDir = Join-Path $OutputDir "hasarbotu-takip-yedek-$stamp"
$zipPath = Join-Path $OutputDir "hasarbotu-takip-yedek-$stamp.zip"
$backupRoot = Join-Path $workDir 'yedek'
New-Item -ItemType Directory -Force -Path $backupRoot | Out-Null

function Get-RelativePathSafe {
  param([string]$BasePath, [string]$ChildPath)
  try {
    return [System.IO.Path]::GetRelativePath($BasePath, $ChildPath)
  } catch {
    $prefix = $BasePath.TrimEnd('\') + '\'
    if ($ChildPath.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase)) {
      return $ChildPath.Substring($prefix.Length)
    }
    return $ChildPath
  }
}

function Convert-SafeRelativePath {
  param([string]$Value)
  $parts = $Value -split '[\\/]+'
  $safeParts = foreach ($part in $parts) {
    $p = $part -replace '[\/:*?"<>|]', '_'
    if ([string]::IsNullOrWhiteSpace($p)) { '_' } else { $p }
  }
  return [System.IO.Path]::Combine($safeParts)
}

Write-Host "HasarBotu canlı takip yedeği oluşturuluyor..." -ForegroundColor Cyan
Write-Host "Klasör: $root"
Write-Host "Yedek:  $zipPath"
Write-Host "Bu komut sadece _HASARBOTU takip verilerini okur ve kopyalar; kaynak klasörde değişiklik yapmaz." -ForegroundColor Yellow

$manifest = New-Object System.Collections.Generic.List[object]
$hasarbotuDirs = @(Get-ChildItem -LiteralPath $root -Directory -Recurse -Force -ErrorAction SilentlyContinue | Where-Object { $_.Name -eq '_HASARBOTU' })

foreach ($dir in $hasarbotuDirs) {
  $casePath = Split-Path -Path $dir.FullName -Parent
  $relCase = Get-RelativePathSafe $root $casePath
  $safeCase = Convert-SafeRelativePath $relCase
  $targetDir = Join-Path $backupRoot $safeCase
  $targetHasarbotu = Join-Path $targetDir '_HASARBOTU'
  New-Item -ItemType Directory -Force -Path $targetHasarbotu | Out-Null

  $files = @(Get-ChildItem -LiteralPath $dir.FullName -File -Force -ErrorAction SilentlyContinue | Where-Object {
    $_.Name -match '^takip\.json$' -or
    $_.Name -match '^takip.*\.json$' -or
    $_.Name -match '\.bak$' -or
    $_.Name -match '\.tmp$' -or
    ($IncludeTxtReports -and $_.Extension -ieq '.txt')
  })

  foreach ($file in $files) {
    $dest = Join-Path $targetHasarbotu $file.Name
    Copy-Item -LiteralPath $file.FullName -Destination $dest -Force
    $manifest.Add([pscustomobject]@{
      Case = $relCase
      SourceFile = Get-RelativePathSafe $root $file.FullName
      BackupFile = Get-RelativePathSafe $workDir $dest
      Size = $file.Length
      Modified = $file.LastWriteTime.ToString('s')
    }) | Out-Null
  }
}

$manifestPath = Join-Path $workDir 'MANIFEST.csv'
$manifest | Export-Csv -LiteralPath $manifestPath -NoTypeInformation -Encoding UTF8

$info = @"
HasarBotu Canlı Takip Yedeği
============================
Oluşturma zamanı : $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
Kaynak klasör    : $root
Yedek ZIP        : $zipPath
_HASARBOTU sayısı: $($hasarbotuDirs.Count)
Yedeklenen dosya : $($manifest.Count)

Bu yedek sadece HasarBotu takip verilerini hedefler. EVRAK/HASAR/ONARIM fotoğraf ve belge
klasörlerini komple yedeklemez. Canlı geçiş öncesinde hızlı geri dönüş için takip.json,
çakışma kopyaları, .bak ve .tmp dosyaları yedeklenir.

Geri dönüş gerektiğinde docs/GERI_DONUS_PLANI.md belgesini uygulayın.
Canlı dağıtımda tüm PC sürümlerini doğrulamak için: npm run live:version-check -- -RootPath "$root" -RegisterThisPC
"@
Set-Content -LiteralPath (Join-Path $workDir 'YEDEK_BILGI.txt') -Value $info -Encoding UTF8

Compress-Archive -LiteralPath (Join-Path $workDir '*') -DestinationPath $zipPath -Force
Remove-Item -LiteralPath $workDir -Recurse -Force

Write-Host ""
Write-Host "Tamam: Canlı takip yedeği oluşturuldu." -ForegroundColor Green
Write-Host $zipPath
Write-Host "Bu ZIP'i canlı geçiş günü saklayın; pCloud klasörünün içine koymayın." -ForegroundColor Yellow

if (-not $NoPause) {
  Write-Host ""
  Read-Host "Çıkmak için Enter"
}
