$ErrorActionPreference = "Stop"
try {
  & chcp.com 65001 > $null
  [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
  $OutputEncoding = [System.Text.UTF8Encoding]::new($false)
} catch {}

Write-Host "HasarBotu Windows kurulum akışı başlıyor..." -ForegroundColor Cyan
Write-Host "Bu proje Windows 10/11 için Electron çalıştırılabilir dosyasını npm install sırasında değil, fix:electron adımında indirir."

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $root

npm config set registry https://registry.npmjs.org/ | Out-Null
Write-Host "npm install çalışıyor..."
npm install
if ($LASTEXITCODE -ne 0) { throw "npm install başarısız oldu." }

Write-Host "Electron Windows çalıştırılabilir dosya düzeltmesi çalışıyor..."
npm run fix:electron
if ($LASTEXITCODE -ne 0) { throw "fix:electron başarısız oldu." }

Write-Host "Proje doğrulaması çalışıyor..."
npm run verify
if ($LASTEXITCODE -ne 0) { throw "verify başarısız oldu." }

Write-Host "Duman testi çalışıyor..."
npm run smoke
if ($LASTEXITCODE -ne 0) { throw "smoke başarısız oldu." }

Write-Host "Türkçe arayüz denetimi çalışıyor..."
npm run audit:turkish
if ($LASTEXITCODE -ne 0) { throw "Türkçe arayüz denetimi başarısız oldu." }

Write-Host "Derleme çalışıyor..."
npm run build
if ($LASTEXITCODE -ne 0) { throw "build başarısız oldu." }

Write-Host "Renderer stabilite denetimi çalışıyor..."
npm run audit:renderer-stability
if ($LASTEXITCODE -ne 0) { throw "Renderer stabilite denetimi başarısız oldu." }

Write-Host "Günlük iş masası denetimi çalışıyor..."
npm run audit:daily-work
if ($LASTEXITCODE -ne 0) { throw "Günlük iş masası denetimi başarısız oldu." }

Write-Host "Saha pilot v2 denetimi çalışıyor..."
npm run audit:field-pilot-v2
if ($LASTEXITCODE -ne 0) { throw "Saha pilot v2 denetimi başarısız oldu." }

Write-Host "Tamam: Windows kurulum ve doğrulama akışı geçti." -ForegroundColor Green
Write-Host "Uygulamayı başlatmak için: npm start"
