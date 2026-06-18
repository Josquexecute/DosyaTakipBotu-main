import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { generateReleaseHashes } from './release-hash.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

function parseArgs(argv = process.argv.slice(2)) {
  const opts = { releaseDir: path.join(projectRoot, 'release'), noPause: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--release-dir' || arg === '--releaseDir' || arg === '-ReleaseDir') opts.releaseDir = path.resolve(argv[++i]);
    else if (arg.startsWith('--release-dir=')) opts.releaseDir = path.resolve(arg.slice('--release-dir='.length));
    else if (arg === '--no-pause' || arg === '-NoPause' || arg === '--NoPause') opts.noPause = true;
  }
  return opts;
}

async function pathExists(targetPath) {
  try { await fs.stat(targetPath); return true; } catch { return false; }
}

export async function generateReleaseNotes(options = {}) {
  const releaseDir = path.resolve(options.releaseDir ?? path.join(projectRoot, 'release'));
  const pkg = JSON.parse(await fs.readFile(path.join(projectRoot, 'package.json'), 'utf8'));
  const version = String(pkg.version);
  const hashJson = path.join(releaseDir, 'RELEASE_HASHES_SHA256.json');
  if (!(await pathExists(hashJson))) {
    await generateReleaseHashes({ releaseDir });
  }
  const hashes = JSON.parse(await fs.readFile(hashJson, 'utf8'));
  const notesPath = path.join(releaseDir, `RELEASE_NOTES_v${version}.md`);
  const lines = [
    `# HasarBotu v${version} Production Candidate Release Notları`,
    '',
    '## Amaç',
    '',
    'Bu sürüm hotfix serisinin sabitlenmiş üretim adayıdır. v0.3.13–v0.3.18 arasındaki veri güvenliği, Windows/ofis dağıtımı, pCloud performansı, dashboard doğruluğu, Excel üretkenliği, davranış testi ve release pipeline stabilizasyonu paketleri bu sürümde birleştirilmiştir.',
    '',
    '## Üretim Adayı Kabul Notu',
    '',
    'Bu release kaynak kod ve EXE üretim paketidir. Canlı ofis sabitlemesi için aşağıdaki saha kabul maddeleri ayrıca tamamlanmalıdır:',
    '',
    '- Windows `npm run pilot:windows -- -BuildExe` logu temiz olmalı.',
    '- `npm run live:backup-tracking` ile takip yedeği alınmalı.',
    '- `npm run live:preflight` raporu temiz olmalı veya tüm uyarılar açıklanmış olmalı.',
    `- \`npm run live:version-check\` ile tüm PC kayıtları aynı v${version} sürümünü göstermeli.`,
    '- Claude/Fable yeni bağımsız raporunda P0/P1 kritik bulgu kalmamalı.',
    '',
    '## SHA-256',
    '',
    '|Dosya|SHA-256|',
    '|---|---|',
    ...hashes.map((item) => `|${item.file}|\`${item.sha256}\`|`),
    '',
    '## Windows Kabul Komutları',
    '',
    '```powershell',
    'npm run pilot:windows -- -BuildExe',
    'npm run live:backup-tracking -- -RootPath "P:\\BARAN GLOBAL EKSPERTİZ\\2026"',
    'npm run live:preflight -- -RootPath "P:\\BARAN GLOBAL EKSPERTİZ\\2026"',
    `npm run live:version-check -- -RootPath "P:\\BARAN GLOBAL EKSPERTİZ\\2026" -ExpectedVersion ${version} -SetExpected -RegisterThisPC`,
    'npm run release:candidate-check -- -RootPath "P:\\BARAN GLOBAL EKSPERTİZ\\2026"',
    '```',
    '',
    '## Rollback',
    '',
    'Geri dönüş gerektiğinde `_HASARBOTU` klasörleri silinmez. Önce uygulamalar kapatılır, önceki EXE kurulur ve yalnızca ilgili plaka klasörünün takip yedeği geri alınır. Önceki EXE ve son takip yedeği release öncesi ayrıca saklanmalıdır.',
    ''
  ];
  await fs.writeFile(notesPath, lines.join('\n'), 'utf8');
  return { notesPath, hashes, version };
}

async function main() {
  const opts = parseArgs();
  const result = await generateReleaseNotes(opts);
  console.log('Production Candidate release notları oluşturuldu.');
  console.log(result.notesPath);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`release:notes başarısız: ${error.message}`);
    process.exit(1);
  });
}
