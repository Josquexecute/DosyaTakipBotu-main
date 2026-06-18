import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

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

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function currentPackageVersion() {
  const pkg = JSON.parse(await fs.readFile(path.join(projectRoot, 'package.json'), 'utf8'));
  return String(pkg.version);
}

async function listReleaseExeAssets(releaseDir) {
  const version = escapeRegExp(await currentPackageVersion());
  const files = (await fs.readdir(releaseDir, { withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(releaseDir, entry.name));
  const installerRegex = new RegExp(`^HasarBotu-Baran-Ekspertiz-Kurulum-${version}\\.exe$`, 'i');
  const portableRegex = new RegExp(`^HasarBotu-Baran-Ekspertiz-Tasinabilir-${version}\\.exe$`, 'i');
  const installer = files.filter((file) => installerRegex.test(path.basename(file)));
  const portable = files.filter((file) => portableRegex.test(path.basename(file)));
  if (installer.length !== 1 || portable.length !== 1) {
    throw new Error(`Release klasorunde guncel surum icin tam 1 kurulum ve 1 tasinabilir EXE bekleniyor. Kurulum=${installer.length}, Tasinabilir=${portable.length}`);
  }
  return [...installer, ...portable].sort((a, b) => path.basename(a).localeCompare(path.basename(b), 'tr'));
}

export async function sha256File(filePath) {
  return await new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

export async function generateReleaseHashes(options = {}) {
  const releaseDir = path.resolve(options.releaseDir ?? path.join(projectRoot, 'release'));
  if (!(await pathExists(releaseDir))) {
    throw new Error(`Release klasoru bulunamadi: ${releaseDir}`);
  }

  const files = await listReleaseExeAssets(releaseDir);
  const hashes = [];
  for (const file of files) {
    const stat = await fs.stat(file);
    hashes.push({
      file: path.basename(file),
      path: file,
      sizeBytes: stat.size,
      sha256: await sha256File(file),
      generatedBy: 'node:crypto'
    });
  }

  const textPath = path.join(releaseDir, 'RELEASE_HASHES_SHA256.txt');
  const jsonPath = path.join(releaseDir, 'RELEASE_HASHES_SHA256.json');
  const txt = hashes.map((item) => `${item.sha256}  ${item.file}`).join('\n') + '\n';
  await fs.writeFile(textPath, txt, 'utf8');
  await fs.writeFile(jsonPath, JSON.stringify(hashes, null, 2) + '\n', 'utf8');
  return { releaseDir, textPath, jsonPath, hashes };
}

async function main() {
  const opts = parseArgs();
  const result = await generateReleaseHashes(opts);
  console.log('Release SHA-256 hashleri olusturuldu.');
  console.log(result.textPath);
  console.log(result.jsonPath);
  for (const item of result.hashes) console.log(`${item.sha256}  ${item.file}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`release:hash basarisiz: ${error.message}`);
    process.exit(1);
  });
}
