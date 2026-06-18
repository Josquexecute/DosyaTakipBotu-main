import fs from 'node:fs/promises';
import path from 'node:path';

const report = [];
function ok(name) { report.push({ name, ok: true }); }
function fail(name, message) { report.push({ name, ok: false, message }); }

try {
  const html = await fs.readFile('src/renderer/index.html', 'utf-8');
  html.includes('Content-Security-Policy') ? ok('Arayüz güvenlik ilkesi') : fail('Arayüz güvenlik ilkesi', 'Güvenlik ilkesi meta etiketi yok');
  const css = await fs.readFile('src/renderer/styles.css', 'utf-8');
  css.includes('--primary: #003f87') ? ok('Stitch renk sistemi') : fail('Stitch renk sistemi', 'ana renk yok');
  const main = await fs.readFile('src/main/main.ts', 'utf-8');
  main.includes('nodeIntegration: SECURITY_FLAGS.nodeIntegration') ? ok('Electron Node erişimi kapalı') : fail('Electron Node erişimi kapalı', 'ayar görünmedi');
  const tracking = await fs.readFile('src/main/tracking/tracking-defaults.ts', 'utf-8');
  tracking.includes('portalChecklist') ? ok('Takip varsayılan şeması') : fail('Takip varsayılan şeması', 'portalChecklist yok');
  const turkish = await fs.readFile('src/shared/turkish.ts', 'utf-8');
  turkish.includes('Ş') && turkish.includes('İ') ? ok('Türkçe normalize modülü') : fail('Türkçe normalize modülü', 'karakter eşlemesi eksik');
  await fs.access(path.join('src','renderer','stitch','screen.png'));
  ok('Stitch ekran görseli paketlendi');
  const scanner = await fs.readFile('src/main/scanner/pcloud-year-scanner.ts', 'utf-8');
  scanner.includes('discoverCaseFolders') ? ok('Gerçek 2026 alt klasör tarayıcısı') : fail('Gerçek 2026 alt klasör tarayıcısı', 'discoverCaseFolders kullanılmıyor');
  const docAnalyzer = await fs.readFile('src/main/import/document-analyzer.ts', 'utf-8');
  docAnalyzer.includes('KARSI TARAF') && docAnalyzer.includes('KTT') ? ok('Gerçek EVRAK adları için analiz kuralları') : fail('Gerçek EVRAK adları için analiz kuralları', 'KARŞI TARAF/KTT kuralları görünmüyor');
} catch (error) {
  fail('Duman testi', String(error));
}
const failed = report.filter((item) => !item.ok);
for (const item of report) console.log(`${item.ok ? 'TAMAM' : 'HATA'} - ${item.name}${item.message ? ': ' + item.message : ''}`);
if (failed.length) process.exit(1);
