import fs from 'node:fs';
import path from 'node:path';

const files = [
  'src/main/main.ts',
  'src/preload/preload.ts',
  'src/renderer/main.ts',
  'src/renderer/app/components/layout.ts',
  'src/renderer/app/components/dashboard.ts',
  'src/renderer/app/components/cases.ts',
  'src/renderer/app/components/detail.ts',
  'src/renderer/app/components/settings.ts',
  'src/main/scanner/pcloud-year-scanner.ts',
  'src/main/tracking/tracking-file-service.ts',
  'src/main/ipc.ts'
];

const forbidden = [
  /\bFile\b/, /\bEdit\b/, /\bView\b/, /\bWindow\b/, /\bSearch\b/, /\bReload\b/,
  /\bDebug Raporu\b/, /\bCache:/, /\bLocal cache modu\b/, /\bmouse wheel\b/,
  /\bAI Kontrol\b/, /\bPortal Checklist\b/, /\bChecklist tamamlanmamış\b/,
  /\bpCloud conflict\b/, /\brecursive okunur\b/, /\broot:\b/
];

const errors = [];
for (const file of files) {
  const text = fs.readFileSync(file, 'utf-8');
  const lines = text.split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    for (const rule of forbidden) {
      if (rule.test(line)) errors.push(`${file}:${index + 1} kullanıcıya görünebilecek İngilizce metin: ${rule}`);
    }
  }
}

const psFiles = ['scripts/install-windows.ps1', 'scripts/fix-electron-win.ps1'];
for (const file of psFiles) {
  const bytes = fs.readFileSync(file);
  const hasUtf8Bom = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  if (!hasUtf8Bom) errors.push(`${file}: Windows PowerShell 5.1 için UTF-8 BOM yok; Türkçe karakterler bozulabilir.`);
}

if (errors.length) {
  console.error('Türkçe arayüz denetimi başarısız:');
  for (const error of errors) console.error('-', error);
  process.exit(1);
}
console.log('Türkçe arayüz denetimi geçti. Menü, arayüz, durum çubuğu ve kullanıcı mesajlarında tespit edilen İngilizce kalmadı.');
