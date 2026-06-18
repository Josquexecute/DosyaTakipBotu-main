import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const electronModule = path.join(root, 'node_modules', 'electron');
const pathTxt = path.join(electronModule, 'path.txt');
const isWindows = process.platform === 'win32' || process.env.HASARBOTU_FORCE_WIN_CHECK === '1';
const electronExe = path.join(electronModule, 'dist', isWindows ? 'electron.exe' : 'electron');
const errors = [];
const warnings = [];

if (!fs.existsSync(electronModule)) {
  errors.push('node_modules/electron bulunamadı. Önce npm install çalıştırın.');
}

if (!fs.existsSync(pathTxt)) {
  errors.push('node_modules/electron/path.txt bulunamadı. Windows için npm run fix:electron çalıştırın.');
} else if (isWindows) {
  const raw = fs.readFileSync(pathTxt, 'utf-8');
  if (raw !== 'electron.exe') {
    if (raw.trim() === 'electron.exe') {
      fs.writeFileSync(pathTxt, 'electron.exe', { encoding: 'ascii' });
      warnings.push('node_modules/electron/path.txt satır sonu içeriyordu; otomatik düzeltildi.');
    } else {
      const visible = raw.replaceAll('\r', '<CR>').replaceAll('\n', '<LF>');
      errors.push(`path.txt içeriği Windows için hatalı: ${visible}`);
    }
  }
} else {
  const raw = fs.readFileSync(pathTxt, 'utf-8');
  if (!raw.trim()) errors.push('node_modules/electron/path.txt boş.');
}

if (isWindows && !fs.existsSync(electronExe)) {
  errors.push('node_modules/electron/dist/electron.exe bulunamadı. npm run fix:electron çalıştırın.');
}

if (warnings.length) {
  for (const warning of warnings) console.warn(`Uyarı: ${warning}`);
}

if (errors.length) {
  console.error('Electron binary kontrolü başarısız:');
  for (const error of errors) console.error(`- ${error}`);
  console.error('\nÖnerilen Windows sırası:');
  console.error('  npm install');
  console.error('  npm run fix:electron');
  console.error('  npm run verify');
  console.error('  npm run smoke');
  console.error('  npm start');
  process.exit(1);
}

console.log('Electron binary kontrolü geçti.');
