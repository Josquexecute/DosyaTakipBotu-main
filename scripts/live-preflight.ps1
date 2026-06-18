param(
  [Parameter(Mandatory = $true)]
  [string]$RootPath,

  [string]$OutputDir = (Join-Path (Resolve-Path (Join-Path $PSScriptRoot '..')) 'pilot-logs'),

  [switch]$NoPause
)

$ErrorActionPreference = "Stop"
try {
  & chcp.com 65001 > $null
  [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
  $OutputEncoding = [System.Text.UTF8Encoding]::new($false)
} catch {}

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location $projectRoot
if (-not (Test-Path -LiteralPath $OutputDir)) { New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null }

$root = (Resolve-Path -LiteralPath $RootPath).Path
if (-not (Test-Path -LiteralPath $root -PathType Container)) {
  throw "Kontrol edilecek klasör bulunamadı veya klasör değil: $RootPath"
}

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$reportPath = Join-Path $OutputDir "canli-on-kontrol-$stamp.md"
$jsonPath = Join-Path $OutputDir "canli-on-kontrol-$stamp.json"

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

function Test-ConflictName {
  param([string]$Name)
  $n = $Name.ToLowerInvariant()
  return ($n -match 'conflict|conflicted|pcloud|çakış|cakış|çakisma|çakışma|collision')
}

Write-Host "HasarBotu canlı geçiş ön kontrolü başlıyor..." -ForegroundColor Cyan
Write-Host "Klasör: $root"
Write-Host "Bu komut pCloud klasörüne yazmaz; sadece okur ve rapor üretir." -ForegroundColor Yellow

$hasarbotuDirs = @(Get-ChildItem -LiteralPath $root -Directory -Recurse -Force -ErrorAction SilentlyContinue | Where-Object { $_.Name -eq '_HASARBOTU' })
$trackingFiles = New-Object System.Collections.Generic.List[object]
$conflictFiles = New-Object System.Collections.Generic.List[object]
$corruptBackups = New-Object System.Collections.Generic.List[object]
$zeroByte = New-Object System.Collections.Generic.List[object]
$parseErrors = New-Object System.Collections.Generic.List[object]
$heavyDamageEnabled = New-Object System.Collections.Generic.List[object]
$schemaWarnings = New-Object System.Collections.Generic.List[object]

$officeStatusFolder = Join-Path $root '_HASARBOTU_OFFICE'
$officeVersionMarkerPath = Join-Path $officeStatusFolder 'office-version.json'
$officeExpectedVersion = ''
$officeClients = @()
if (Test-Path -LiteralPath $officeVersionMarkerPath -PathType Leaf) {
  try {
    $marker = Get-Content -LiteralPath $officeVersionMarkerPath -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($marker.expectedVersion) { $officeExpectedVersion = [string]$marker.expectedVersion }
  } catch {}
}
$officeClientsDir = Join-Path $officeStatusFolder 'clients'
if (Test-Path -LiteralPath $officeClientsDir -PathType Container) {
  Get-ChildItem -LiteralPath $officeClientsDir -File -Filter '*.json' -ErrorAction SilentlyContinue | ForEach-Object {
    try { $officeClients += (Get-Content -LiteralPath $_.FullName -Raw -Encoding UTF8 | ConvertFrom-Json) } catch {}
  }
}

foreach ($dir in $hasarbotuDirs) {
  $casePath = Split-Path -Path $dir.FullName -Parent
  $relCase = Get-RelativePathSafe $root $casePath
  $children = @(Get-ChildItem -LiteralPath $dir.FullName -File -Force -ErrorAction SilentlyContinue)

  foreach ($file in $children) {
    $relFile = Get-RelativePathSafe $root $file.FullName
    if (Test-ConflictName $file.Name) {
      $conflictFiles.Add([pscustomobject]@{ Case = $relCase; File = $relFile; Size = $file.Length; Modified = $file.LastWriteTime }) | Out-Null
    }
    if ($file.Name -match '^takip\.json\.corrupt-|\.bak$') {
      $corruptBackups.Add([pscustomobject]@{ Case = $relCase; File = $relFile; Size = $file.Length; Modified = $file.LastWriteTime }) | Out-Null
    }
    if ($file.Length -eq 0 -and $file.Name -match '\.json$') {
      $zeroByte.Add([pscustomobject]@{ Case = $relCase; File = $relFile; Modified = $file.LastWriteTime }) | Out-Null
    }
  }

  $trackingPath = Join-Path $dir.FullName 'takip.json'
  if (Test-Path -LiteralPath $trackingPath -PathType Leaf) {
    $item = Get-Item -LiteralPath $trackingPath
    $trackingFiles.Add([pscustomobject]@{ Case = $relCase; File = Get-RelativePathSafe $root $trackingPath; Size = $item.Length; Modified = $item.LastWriteTime }) | Out-Null
    try {
      $raw = Get-Content -LiteralPath $trackingPath -Raw -Encoding UTF8
      $json = $raw | ConvertFrom-Json -ErrorAction Stop
      $hasRootShape = ($null -ne $json.schemaVersion -and $null -ne $json.caseIdentity -and $null -ne $json.metadata -and $null -ne $json.portalChecklist -and $null -ne $json.todos -and $null -ne $json.notes)
      $hasRevision = ($null -ne $json.metadata -and $null -ne $json.metadata.revision)
      $hasCaseKey = ($null -ne $json.caseIdentity -and $null -ne $json.caseIdentity.caseKey)
      if (-not $hasRootShape -or -not $hasRevision -or -not $hasCaseKey) {
        $schemaWarnings.Add([pscustomobject]@{ Case = $relCase; File = Get-RelativePathSafe $root $trackingPath; Warning = 'Güncel HasarBotu takip schema alanlarından biri eksik görünüyor: schemaVersion/caseIdentity/metadata.revision/portalChecklist/todos/notes.' }) | Out-Null
      }
      if ($null -ne $json.metadata -and $null -eq $json.metadata.writeId) {
        $schemaWarnings.Add([pscustomobject]@{ Case = $relCase; File = Get-RelativePathSafe $root $trackingPath; Warning = 'metadata.writeId eksik; eski sürüm veya manuel düzenleme olabilir.' }) | Out-Null
      }
      if ($null -ne $json.heavyDamage -and $json.heavyDamage.enabled -eq $true) {
        $heavyDamageEnabled.Add([pscustomobject]@{ Case = $relCase; File = Get-RelativePathSafe $root $trackingPath; Modified = $item.LastWriteTime }) | Out-Null
      }
    } catch {
      $parseErrors.Add([pscustomobject]@{ Case = $relCase; File = Get-RelativePathSafe $root $trackingPath; Error = $_.Exception.Message }) | Out-Null
    }
  }
}

$openCaseDirs = @(Get-ChildItem -LiteralPath $root -Directory -Recurse -Force -ErrorAction SilentlyContinue | Where-Object { $_.Name -notin @('_HASARBOTU') -and $_.FullName -notmatch '\\_HASARBOTU(\\|$)' })

$status = 'GEÇTİ'
if ($parseErrors.Count -gt 0 -or $zeroByte.Count -gt 0 -or $conflictFiles.Count -gt 0) { $status = 'DİKKAT' }

$result = [pscustomobject]@{
  status = $status
  rootPath = $root
  createdAt = (Get-Date).ToString('s')
  hasarbotuFolderCount = $hasarbotuDirs.Count
  trackingFileCount = $trackingFiles.Count
  conflictFileCount = $conflictFiles.Count
  corruptBackupCount = $corruptBackups.Count
  zeroByteJsonCount = $zeroByte.Count
  parseErrorCount = $parseErrors.Count
  heavyDamageEnabledCount = $heavyDamageEnabled.Count
  schemaWarningCount = $schemaWarnings.Count
  officeExpectedVersion = $officeExpectedVersion
  officeRegisteredClientCount = $officeClients.Count
  officeClients = $officeClients
  conflictFiles = $conflictFiles
  parseErrors = $parseErrors
  zeroByteJsonFiles = $zeroByte
  schemaWarnings = $schemaWarnings
  heavyDamageEnabled = $heavyDamageEnabled
}

$result | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $jsonPath -Encoding UTF8

$report = New-Object System.Text.StringBuilder
[void]$report.AppendLine('# HasarBotu Canlı Geçiş Ön Kontrol Raporu')
[void]$report.AppendLine('')
[void]$report.AppendLine("- Durum: **$status**")
[void]$report.AppendLine("- Kontrol zamanı: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')")
[void]$report.AppendLine('- Klas?r: `' + $root + '`')
[void]$report.AppendLine('')
[void]$report.AppendLine('## Sayımlar')
[void]$report.AppendLine('')
[void]$report.AppendLine("- `_HASARBOTU` klasörü: $($hasarbotuDirs.Count)")
[void]$report.AppendLine("- `takip.json`: $($trackingFiles.Count)")
[void]$report.AppendLine("- pCloud çakışma kopyası şüphesi: $($conflictFiles.Count)")
[void]$report.AppendLine("- corrupt/bak dosyası: $($corruptBackups.Count)")
[void]$report.AppendLine("- sıfır byte JSON: $($zeroByte.Count)")
[void]$report.AppendLine("- okunamayan/parse edilemeyen `takip.json`: $($parseErrors.Count)")
[void]$report.AppendLine("- ağır hasar takip alanı açık dosya: $($heavyDamageEnabled.Count)")
[void]$report.AppendLine("- temel schema uyarısı: $($schemaWarnings.Count)")
[void]$report.AppendLine("- ofis hedef sürümü: $(if ($officeExpectedVersion) { 'v' + $officeExpectedVersion } else { 'yok' })")
[void]$report.AppendLine("- ofis sürüm kaydı olan PC: $($officeClients.Count)")
[void]$report.AppendLine('')
[void]$report.AppendLine('## Karar')
[void]$report.AppendLine('')
if ($status -eq 'GEÇTİ') {
  [void]$report.AppendLine('Bloklayıcı takip dosyası riski tespit edilmedi. Yine de canlı kullanım öncesi `npm run live:backup-tracking` ile takip yedeği alınmalıdır.')
} else {
  [void]$report.AppendLine('Canlı geçişten önce aşağıdaki uyarılar manuel incelenmelidir. Özellikle çakışma kopyası, sıfır byte JSON ve parse hatası varken canlı kullanıma geçilmemelidir.')
}
[void]$report.AppendLine('')

if (-not $officeExpectedVersion) {
  [void]$report.AppendLine('## Ofis Sürüm Kontrolü')
  [void]$report.AppendLine('')
  [void]$report.AppendLine('Ofis hedef sürüm kaydı bulunamadı. Aktif kök yerel klasör olmalıdır (pCloud yalnızca manuel yedek/arşiv). Örnek: `npm run live:version-check -- -RootPath "D:\BARAN_GLOBAL_EKSPERTIZ\2026" -ExpectedVersion 0.4.11 -SetExpected -RegisterThisPC` komutu çalıştırılmalıdır.')
  [void]$report.AppendLine('')
} elseif ($officeClients.Count -eq 0) {
  [void]$report.AppendLine('## Ofis Sürüm Kontrolü')
  [void]$report.AppendLine('')
  [void]$report.AppendLine("Hedef sürüm v$officeExpectedVersion görünüyor; fakat kayıtlı PC yok. Her PC için sürüm kaydı alınmalıdır.")
  [void]$report.AppendLine('')
}

function Add-TableSection {
  param([string]$Title, [System.Collections.IEnumerable]$Rows, [string[]]$Columns)
  [void]$report.AppendLine("## $Title")
  [void]$report.AppendLine('')
  $arr = @($Rows)
  if ($arr.Count -eq 0) {
    [void]$report.AppendLine('Yok.')
    [void]$report.AppendLine('')
    return
  }
  [void]$report.AppendLine('|' + ($Columns -join '|') + '|')
  [void]$report.AppendLine('|' + (($Columns | ForEach-Object { '---' }) -join '|') + '|')
  foreach ($row in $arr | Select-Object -First 50) {
    $vals = foreach ($col in $Columns) { [string]$row.$col -replace '\|','/' }
    [void]$report.AppendLine('|' + ($vals -join '|') + '|')
  }
  if ($arr.Count -gt 50) { [void]$report.AppendLine("\nİlk 50 kayıt gösterildi. Tam liste JSON raporundadır.") }
  [void]$report.AppendLine('')
}

Add-TableSection 'pCloud Çakışma Kopyası Şüpheleri' $conflictFiles @('Case','File','Size','Modified')
Add-TableSection 'Parse Hataları' $parseErrors @('Case','File','Error')
Add-TableSection 'Sıfır Byte JSON Dosyaları' $zeroByte @('Case','File','Modified')
Add-TableSection 'Schema Uyarıları' $schemaWarnings @('Case','File','Warning')
Add-TableSection 'Ağır Hasar Takip Alanı Açık Dosyalar' $heavyDamageEnabled @('Case','File','Modified')

$report.ToString() | Set-Content -LiteralPath $reportPath -Encoding UTF8

Write-Host ""
Write-Host "Tamam: Canlı ön kontrol raporu oluşturuldu." -ForegroundColor Green
Write-Host $reportPath
Write-Host $jsonPath
if ($status -ne 'GEÇTİ') {
  Write-Host "Durum: $status - Canlı geçişten önce raporu inceleyin." -ForegroundColor Yellow
} else {
  Write-Host "Durum: GEÇTİ" -ForegroundColor Green
}

if (-not $NoPause) {
  Write-Host ""
  Read-Host "Çıkmak için Enter"
}
