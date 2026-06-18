import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

function parseArgs(argv = process.argv.slice(2)) {
  const opts = { skipCi: false, skipExe: false, releaseDir: path.join(projectRoot, 'release') };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--skip-ci') opts.skipCi = true;
    else if (arg === '--skip-exe' || arg === '--no-exe') opts.skipExe = true;
    else if (arg === '--release-dir' || arg === '-ReleaseDir') opts.releaseDir = path.resolve(argv[++i]);
    else if (arg.startsWith('--release-dir=')) opts.releaseDir = path.resolve(arg.slice('--release-dir='.length));
  }
  return opts;
}

function runNpm(args) {
  const npmExecPath = process.env.npm_execpath;
  if (npmExecPath) {
    execFileSync(process.execPath, [npmExecPath, ...args], { cwd: projectRoot, stdio: 'inherit' });
    return;
  }
  // Some Windows shells reject direct npm command spawning with EINVAL.
  execFileSync('npm', args, { cwd: projectRoot, stdio: 'inherit', shell: process.platform === 'win32' });
}

async function pathExists(targetPath) {
  try { await fs.stat(targetPath); return true; } catch { return false; }
}

async function currentPackageVersion() {
  const pkg = JSON.parse(await fs.readFile(path.join(projectRoot, 'package.json'), 'utf8'));
  return String(pkg.version);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function listRootFiles(dir) {
  if (!(await pathExists(dir))) return [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return entries.filter((entry) => entry.isFile()).map((entry) => path.join(dir, entry.name));
}

async function findCurrentVersionExeAssets(releaseDir, version) {
  const escapedVersion = escapeRegExp(version);
  const installerRegex = new RegExp(`^HasarBotu-Baran-Ekspertiz-Kurulum-${escapedVersion}\\.exe$`, 'i');
  const portableRegex = new RegExp(`^HasarBotu-Baran-Ekspertiz-Tasinabilir-${escapedVersion}\\.exe$`, 'i');
  const rootFiles = await listRootFiles(releaseDir);
  return {
    installer: rootFiles.filter((file) => installerRegex.test(path.basename(file))),
    portable: rootFiles.filter((file) => portableRegex.test(path.basename(file)))
  };
}

async function main() {
  const opts = parseArgs();
  if (!opts.skipCi) runNpm(['run', 'ci']);
  else console.log('DIKKAT: --skip-ci kullanildi; release dry-run tam dogrulama degildir.');

  const localCacheRequired = [
    'src/main/local-cache/local-cache-store.ts',
    'src/main/local-cache/thumbnail-cache.ts',
    'src/main/local-cache/local-settings-store.ts'
  ];
  for (const file of localCacheRequired) {
    if (!(await pathExists(path.join(projectRoot, file)))) throw new Error(`Artifact butunlugu eksik: ${file}`);
  }

  const releaseDir = path.resolve(opts.releaseDir);
  const version = await currentPackageVersion();
  const { installer, portable } = await findCurrentVersionExeAssets(releaseDir, version);
  const exeFiles = [...installer, ...portable];

  if (!opts.skipExe && (installer.length !== 1 || portable.length !== 1)) {
    throw new Error(`Release klasorunde v${version} icin tam 1 kurulum ve 1 tasinabilir EXE bekleniyor. Kurulum=${installer.length}, Tasinabilir=${portable.length}. Once npm run dist:win calistir.`);
  }

  if (opts.skipExe) {
    console.log('DIKKAT: --skip-exe kullanildi; Windows EXE/release asset kabulu yapilmadi.');
  }

  if (exeFiles.length >= 1) {
    runNpm(['run', 'release:hash', '--', '--release-dir', releaseDir]);
    runNpm(['run', 'release:notes', '--', '--release-dir', releaseDir]);
  }

  console.log('release:dry-run tamamlandi. GitHub Release oncesi cikti ve uyarilari kontrol edin.');
}

main().catch((error) => {
  console.error(`release:dry-run basarisiz: ${error.message}`);
  process.exit(1);
});
