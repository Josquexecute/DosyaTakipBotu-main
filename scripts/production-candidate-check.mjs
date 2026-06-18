import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

function parseArgs(argv = process.argv.slice(2)) {
  const opts = {
    rootPath: '',
    expectedVersion: '',
    releaseDir: path.join(projectRoot, 'release'),
    outputDir: path.join(projectRoot, 'pilot-logs'),
    skipFreshBuild: false,
    skipReleaseAssets: false,
    allowWarnings: false,
    noPause: false
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '-RootPath' || arg === '--root-path') opts.rootPath = argv[++i] ?? '';
    else if (arg === '-ExpectedVersion' || arg === '--expected-version') opts.expectedVersion = argv[++i] ?? '';
    else if (arg === '-ReleaseDir' || arg === '--release-dir') opts.releaseDir = path.resolve(argv[++i]);
    else if (arg === '-OutputDir' || arg === '--output-dir') opts.outputDir = path.resolve(argv[++i]);
    else if (arg === '-SkipFreshBuild' || arg === '--skip-fresh-build' || arg === '--skip-build') opts.skipFreshBuild = true;
    else if (arg === '-SkipReleaseAssets' || arg === '--skip-release-assets' || arg === '--skip-assets') opts.skipReleaseAssets = true;
    else if (arg === '-AllowWarnings' || arg === '--allow-warnings') opts.allowWarnings = true;
    else if (arg === '-NoPause' || arg === '--no-pause') opts.noPause = true;
  }
  return opts;
}

async function pathExists(targetPath) {
  try { await fs.stat(targetPath); return true; } catch { return false; }
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

async function readText(file) {
  return fs.readFile(file, 'utf8');
}

async function listRootFiles(dir) {
  if (!(await pathExists(dir))) return [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return entries.filter((entry) => entry.isFile()).map((entry) => path.join(dir, entry.name));
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

function status(ok, warning = false) {
  return ok ? 'GECTI' : warning ? 'DIKKAT' : 'HATA';
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
  await fs.mkdir(opts.outputDir, { recursive: true });
  const checks = [];
  const add = (name, st, detail = '') => checks.push({ name, status: st, detail });
  const pkg = await readJson(path.join(projectRoot, 'package.json'));
  const version = String(pkg.version);
  const expectedVersion = opts.expectedVersion || version;

  if (!opts.skipFreshBuild) {
    try {
      runNpm(['run', 'build']);
      add('Fresh source build', 'GECTI', 'npm run build basariyla tamamlandi.');
    } catch (error) {
      add('Fresh source build', 'HATA', `npm run build basarisiz: ${error.message}`);
    }
  } else {
    add('Fresh source build', 'DIKKAT', '-SkipFreshBuild kullanildi; bu rapor Windows/production adayini tam dogrulamaz.');
  }

  add('package.json surumu', status(version === expectedVersion), `package=${version} expected=${expectedVersion}`);
  const constantsPath = path.join(projectRoot, 'src/shared/constants.ts');
  const constantsText = (await pathExists(constantsPath)) ? await readText(constantsPath) : '';
  add('APP_VERSION uyumu', status(constantsText.includes(`APP_VERSION = '${version}'`)), `APP_VERSION v${version} olmali`);

  for (const doc of ['docs/GERI_DONUS_PLANI.md', 'docs/CANLI_KULLANIM_KILAVUZU.md', 'docs/OFIS_DAGITIM_KONTROL_LISTESI.md', 'docs/V0.4.0_PRODUCTION_CANDIDATE.md']) {
    add(`Operasyon dokumani: ${doc}`, status(await pathExists(path.join(projectRoot, doc))), doc);
  }

  if (opts.skipReleaseAssets) {
    add('Release asset kontrolu', 'DIKKAT', '-SkipReleaseAssets kullanildi; EXE/SHA/release notes kontrolu atlandi. Bu aday tam Windows release kabulu degildir.');
  } else if (!(await pathExists(opts.releaseDir))) {
    add('Release klasoru', 'HATA', `Release klasoru yok: ${opts.releaseDir}`);
  } else {
    const { installer, portable } = await findCurrentVersionExeAssets(path.resolve(opts.releaseDir), version);
    add('Release EXE ciktisi', status(installer.length === 1 && portable.length === 1), `Kurulum=${installer.length}, Tasinabilir=${portable.length}`);
    add('Release SHA-256 TXT', status(await pathExists(path.join(opts.releaseDir, 'RELEASE_HASHES_SHA256.txt'))), path.join(opts.releaseDir, 'RELEASE_HASHES_SHA256.txt'));
    add('Release SHA-256 JSON', status(await pathExists(path.join(opts.releaseDir, 'RELEASE_HASHES_SHA256.json'))), path.join(opts.releaseDir, 'RELEASE_HASHES_SHA256.json'));
    add('Release notes', status(await pathExists(path.join(opts.releaseDir, `RELEASE_NOTES_v${version}.md`))), path.join(opts.releaseDir, `RELEASE_NOTES_v${version}.md`));
  }

  if (opts.rootPath) {
    const marker = path.join(opts.rootPath, '_HASARBOTU_OFFICE', 'office-version.json');
    if (await pathExists(marker)) {
      try {
        const data = await readJson(marker);
        add('Ofis hedef surumu', status(String(data.expectedVersion ?? '') === expectedVersion, true), `marker=${data.expectedVersion ?? ''} expected=${expectedVersion}`);
      } catch (error) {
        add('Ofis hedef surumu', 'DIKKAT', `office-version.json okunamadi: ${error.message}`);
      }
    } else {
      add('Ofis hedef surumu', 'DIKKAT', `office-version.json yok: ${marker}`);
    }
  } else {
    add('Ofis hedef surumu', 'DIKKAT', '-RootPath verilmedi; ofis marker kontrolu atlandi.');
  }

  const logPath = path.join(opts.outputDir, `production-candidate-check-v${version}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  await fs.writeFile(logPath, JSON.stringify({ generatedAt: new Date().toISOString(), version, expectedVersion, checks }, null, 2), 'utf8');
  for (const item of checks) console.log(`${item.status} - ${item.name}${item.detail ? ` (${item.detail})` : ''}`);
  console.log(`Rapor: ${logPath}`);

  const hardFailures = checks.filter((item) => item.status === 'HATA');
  if (hardFailures.length) process.exit(1);

  const warnings = checks.filter((item) => item.status === 'DIKKAT');
  if (warnings.length) {
    console.log(`DIKKAT: ${warnings.length} uyari var. Windows/ofis kabulu icin aciklanmali.`);
    if (!opts.allowWarnings) console.log('Not: Uyarilar exit code uretmez; fakat rapor tam kabul degildir. Bilincli kabul icin --allow-warnings ile tekrar calistirilabilir.');
  }
}

main().catch((error) => {
  console.error(`release:candidate-check basarisiz: ${error.message}`);
  process.exit(1);
});
