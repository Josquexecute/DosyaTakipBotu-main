import fs from 'node:fs';
import path from 'node:path';

const errors = [];
const required = [
  'package.json', 'package-lock.json', '.npmrc', '.gitignore', '.gitattributes',
  '.github/workflows/ci.yml', '.github/workflows/release.yml',
  'tsconfig.base.json', 'tsconfig.main.json', 'tsconfig.preload.json', 'tsconfig.renderer.json',
  'src/main/main.ts', 'src/main/ipc.ts', 'src/main/security.ts', 'src/main/debug-logger.ts',
  'src/main/services/ipc-domain-services.ts',
  'src/main/local-cache/local-cache-store.ts', 'src/main/local-cache/local-settings-store.ts', 'src/main/local-cache/thumbnail-cache.ts',
  'src/main/import/document-analyzer.ts', 'src/main/import/photo-analyzer.ts', 'src/main/import/case-folder-content-analyzer.ts',
  'src/main/scanner/case-folder-utils.ts', 'src/main/scanner/folder-analyzer.ts', 'src/main/scanner/folder-fingerprint.ts', 'src/main/scanner/pcloud-year-scanner.ts',
  'src/main/storage/atomic-write.ts', 'src/main/storage/json-io.ts', 'src/main/storage/conflict-file-detector.ts', 'src/main/storage/file-lock.ts',
  'src/main/tracking/tracking-file-service.ts', 'src/main/tracking/tracking-defaults.ts', 'src/main/tracking/tracking-schema.ts',
  'src/preload/preload.ts',
  'src/shared/constants.ts', 'src/shared/daily-work.ts', 'src/shared/data-quality.ts', 'src/shared/document-rules.ts', 'src/shared/ipc-contract.ts', 'src/shared/photo-rules.ts', 'src/shared/renderer-stability.ts', 'src/shared/tracking-item-id.ts', 'src/shared/turkish.ts', 'src/shared/types.ts',
  'src/renderer/index.html', 'src/renderer/main.ts', 'src/renderer/styles.css', 'src/renderer/types.d.ts',
  'src/renderer/app/components/settings.ts', 'src/renderer/app/components/home.ts', 'src/renderer/app/components/folders.ts',
  'src/renderer/stitch/DESIGN.md', 'src/renderer/stitch/screen.png',
  'scripts/fix-electron-win.ps1', 'scripts/install-windows.ps1', 'scripts/pilot-windows-check.ps1', 'scripts/pilot-copy-month.ps1', 'scripts/pilot-collect-diagnostics.ps1', 'scripts/check-office-versions.ps1', 'scripts/release-hash.ps1', 'scripts/release-notes.ps1', 'scripts/production-candidate-check.ps1', 'scripts/release-hash.mjs', 'scripts/release-notes.mjs', 'scripts/production-candidate-check.mjs', 'scripts/release-dry-run.mjs', 'scripts/check-electron-binary.mjs', 'scripts/turkish-ui-audit.mjs', 'scripts/windows-compat-check.mjs', 'scripts/behavior-regression-tests.mjs', 'scripts/ipc-contract-audit.mjs', 'scripts/renderer-stability-audit.mjs', 'scripts/daily-work-audit.mjs', 'scripts/field-pilot-v2-audit.mjs',
  'docs/README.md', 'docs/ARCHITECTURE.md', 'docs/STITCH_UI_INTEGRATION.md', 'docs/PILOT_KABUL_PLANI.md', 'docs/PILOT_SAHA_TEST_FORMU.md', 'docs/CANLI_GECIS_KARARI.md', 'docs/CANLI_KULLANIM_KILAVUZU.md', 'docs/GERI_DONUS_PLANI.md', 'docs/OFIS_DAGITIM_KONTROL_LISTESI.md', 'docs/V0.4.0_PRODUCTION_CANDIDATE.md'
];

for (const file of required) {
  if (!fs.existsSync(file)) errors.push(`Eksik dosya: ${file}`);
}

const read = (file) => fs.readFileSync(file, 'utf-8');
const readJson = (file) => JSON.parse(read(file));

const pkg = readJson('package.json');
if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(pkg.version)) errors.push(`Paket sürümü semver formatında değil: ${pkg.version}`);
const constantsText = read('src/shared/constants.ts');
if (!constantsText.includes(`APP_VERSION = '${pkg.version}'`)) errors.push(`src/shared/constants.ts APP_VERSION package.json ile uyumlu değil: ${pkg.version}`);
for (const script of ['fix:electron', 'install:windows', 'check:electron', 'typecheck', 'build', 'verify', 'smoke', 'audit:turkish', 'compat:windows', 'test:behavior', 'ci', 'dist:win', 'pilot:windows', 'pilot:copy-month', 'pilot:collect', 'live:version-check', 'release:hash', 'release:notes', 'release:candidate-check', 'release:dry-run', 'audit:ipc-contract', 'audit:renderer-stability', 'audit:daily-work', 'audit:field-pilot-v2']) {
  if (!pkg.scripts?.[script]) errors.push(`package.json içinde ${script} script yok.`);
}
if (!JSON.stringify(pkg.build ?? {}).includes('nsis')) errors.push('package.json electron-builder nsis hedefi içermiyor.');
if (!JSON.stringify(pkg.build ?? {}).includes('portable')) errors.push('package.json electron-builder portable hedefi içermiyor.');

const lock = readJson('package-lock.json');
if (lock.version !== pkg.version || lock.packages?.['']?.version !== pkg.version) {
  errors.push(`package-lock.json kök sürümü package.json ile uyumlu değil. package=${pkg.version} lock=${lock.version} root=${lock.packages?.['']?.version}`);
}
const lockText = read('package-lock.json');
if (/applied-caas|internal\.api\.openai|artifactory/.test(lockText)) errors.push('package-lock.json içinde sandbox/iç npm registry URL kalmış.');
if (/git\+ssh:\/\/|ssh:\/\/git@github\.com/.test(lockText)) errors.push('package-lock.json içinde SSH git bağımlılığı kalmış; GitHub Actions veya ofis ağı npm ci adımını kilitleyebilir.');

const npmrcText = read('.npmrc');
if (!npmrcText.includes('registry=https://registry.npmjs.org/')) errors.push('.npmrc public npm registry kullanmıyor.');
if (!npmrcText.includes('ignore-scripts=true')) errors.push('.npmrc içinde ignore-scripts=true yok; Electron postinstall Windows kurulumunu bozabilir.');

const gitignore = read('.gitignore');
if (/^local-cache\/\s*$/m.test(gitignore)) errors.push('.gitignore içindeki local-cache/ deseni src/main/local-cache kaynak klasörünü de ignore eder. /local-cache/ kullanılmalı.');
if (!/^\/local-cache\/\s*$/m.test(gitignore)) errors.push('.gitignore kök local cache için /local-cache/ deseni içermiyor.');

const mainText = read('src/main/main.ts');
for (const needle of ['contextIsolation', 'nodeIntegration', 'sandbox', 'webSecurity', './local-cache/local-cache-store']) {
  if (!mainText.includes(needle)) errors.push(`main.ts beklenen içerik yok: ${needle}`);
}

const ipcContractText = read('src/shared/ipc-contract.ts');
const preloadText = `${read('src/preload/preload.ts')}\n${ipcContractText}`;
if (!preloadText.includes('contextBridge.exposeInMainWorld')) errors.push('Güvenli köprü contextBridge ile dışa açılmıyor.');
if (!preloadText.includes('validSendChannels')) errors.push('Güvenli köprü olay kanalı izin listesi görünmüyor.');

const rendererHtml = read('src/renderer/index.html');
if (!rendererHtml.includes('Content-Security-Policy')) errors.push('Arayüz index.html güvenlik ilkesi içermiyor.');

const securityText = read('src/main/security.ts');
for (const needle of ['https:', 'assertSafeCasePath', 'nodeIntegration: false', 'sandbox: true', 'isPathInsideNormalized']) {
  if (!securityText.includes(needle)) errors.push(`security.ts beklenen güvenlik izi yok: ${needle}`);
}
const pathNormalizationText = await read('src/shared/path-normalization.ts');
for (const needle of ['normalizePathForCompare', '.toUpperCase()', '[İIıi]']) {
  if (!pathNormalizationText.includes(needle)) errors.push(`path-normalization.ts beklenen güvenlik izi yok: ${needle}`);
}
if (securityText.includes("toLocaleUpperCase('tr-TR')")) errors.push('security.ts içinde Türkçe locale upper-case kalmış; Windows yol karşılaştırmasında ASCII I/İ sapması oluşturabilir.');

const trackingText = read('src/main/tracking/tracking-file-service.ts');
if (!trackingText.includes('Ana takip.json yerinde korundu; varsayılan dosya oluşturulmadı')) errors.push('tracking-file-service.ts bozuk takip dosyasında ana takip.json koruma/default engelini içermiyor.');
if (!trackingText.includes('copyCorruptTrackingForRecovery') || !trackingText.includes('fs.copyFile')) errors.push('tracking-file-service.ts corrupt takip dosyasında rename yerine kopya-yedek akışını içermiyor.');
if (trackingText.includes('fs.rename') && trackingText.includes('corrupt')) errors.push('tracking-file-service.ts corrupt takip dosyasını rename ediyor; Hotfix 4 kopya-yedek gerektirir.');
if (!trackingText.includes('hasCorruptBackupSibling')) errors.push('tracking-file-service.ts bozuk yedek varken default takip.json oluşturmayı engellemiyor.');
if (trackingText.includes('corrupt: raw !== null')) errors.push('tracking-file-service.ts corrupt JSON durumunu maskeleyen eski kontrolü hâlâ içeriyor.');
if (!trackingText.includes('Takip dosyası şeması geçersiz')) errors.push('tracking-file-service.ts geçersiz takip şemasını güvenli raporlama kontrolünü içermiyor.');
if (!trackingText.includes('daha yeni bir HasarBotu sürümüyle oluşturulmuş')) errors.push('tracking-file-service.ts desteklenmeyen yeni schema dosyalarını read-only korumaya almıyor.');
if (trackingText.includes('tracking.assignment.takipTarihi = today')) errors.push('tracking-file-service.ts takipTarihi alanını mutasyonlarda otomatik bugüne çekiyor.');
if (!trackingText.includes('tracking.assignment.sonIslemTarihi = todayLocalDateInput()')) errors.push('tracking-file-service.ts mutasyonlarda sonIslemTarihi güncellemesini içermiyor.');
if (!trackingText.includes('withFileLock')) errors.push('tracking-file-service.ts revision conflict için lock koruması içermiyor.');

const stitchDesign = read('src/renderer/stitch/DESIGN.md');
if (!stitchDesign.includes('HasarBotu Enterprise') || !stitchDesign.includes('Dense Functionalist')) errors.push('Stitch DESIGN.md beklenen görsel sistem kaynağı değil.');
if (/https?:\/\/|cdn\.tailwindcss|fonts\.googleapis|material-symbols|Material Symbols/.test(stitchDesign)) errors.push('Stitch referansı üretim paketinde uzak font/CDN/icon izi içeriyor.');

const scannerText = read('src/main/scanner/pcloud-year-scanner.ts');
if (!scannerText.includes('discoverCaseFolders')) errors.push('pCloud scanner gerçek 2026 kapalı klasör keşif fonksiyonunu kullanmıyor.');
const folderUtilsText = read('src/main/scanner/case-folder-utils.ts');
for (const needle of ['NON_CASE_FOLDER_NAMES', 'hasCaseFolderSignalFromEntries', 'isLikelyClaimNoticeFile']) {
  if (!folderUtilsText.includes(needle)) errors.push(`case-folder-utils.ts Hotfix 4 klasör tanıma koruması yok: ${needle}`);
}
const excelImporterText = read('src/main/import/excel-importer.ts');
for (const needle of ['requiresUserConfirmation', 'fallback-numeric-column', 'samePath', 'formulasWillBeReplaced']) {
  if (!excelImporterText.includes(needle)) errors.push(`excel-importer.ts Hotfix 4 Excel risk kapısı yok: ${needle}`);
}
const moneyHeaderLine = excelImporterText.match(/const MONEY_HEADER_KEYWORDS = \[([^\]]*)\]/)?.[1] ?? '';
if (moneyHeaderLine.includes('TOPLAM')) errors.push('excel-importer.ts TOPLAM kelimesini doğrudan para kolonu başlığı olarak kullanıyor.');
const fingerprintText = read('src/main/scanner/folder-fingerprint.ts');
if (!fingerprintText.includes('collectFingerprintEntries')) errors.push('folder-fingerprint.ts alt dosya değişikliklerini yakalayacak recursive metadata toplamıyor.');


const layoutText = read('src/renderer/app/components/layout.ts');
const dashboardText = read('src/renderer/app/components/dashboard.ts');
const casesText = read('src/renderer/app/components/cases.ts');
const dailyWorkText = read('src/shared/daily-work.ts');
const dataQualityText = read('src/shared/data-quality.ts');
const settingsText = read('src/renderer/app/components/settings.ts');
const ipcText = `${read('src/main/ipc.ts')}\n${ipcContractText}`;
if (!layoutText.includes('Sürüm v') || !layoutText.includes('renderDeploymentWarning')) errors.push('Arayüzde görünür sürüm etiketi veya eski sürüm uyarı bannerı yok.');
if (!dailyWorkText.includes('buildDailyWorkSummary') || !dailyWorkText.includes('matchesDailyWorkFilter')) errors.push('Günlük iş masası saf helper modülü eksik.');
if (!dataQualityText.includes('analyzeCaseDataQuality') || !dataQualityText.includes('closed-open-todo') || !dataQualityText.includes('stale-open-case')) errors.push('Veri kalitesi helper modülü beklenen saha pilot kontrollerini içermiyor.');
if (!dashboardText.includes('Bugün İş Masası') || !dashboardText.includes('daily-work-desk') || !dashboardText.includes('Veri Kalitesi')) errors.push('Dashboard sabah iş masası v2 alanını render etmiyor.');
for (const needle of ["case 'mine'", "case 'overdue'", "case 'today'", "case 'week'", "case 'risk'", "case 'unassigned'", "case 'stale'", "case 'quality'"]) {
  if (!casesText.includes(needle)) errors.push(`Dosya listesi günlük iş filtresini desteklemiyor: ${needle}`);
}
const pilotPlanText = read('docs/PILOT_KABUL_PLANI.md');
if (!pilotPlanText.includes('Saha Pilot v2') || !pilotPlanText.includes('Veri Kalitesi')) errors.push('Pilot kabul planı saha pilot v2 veri kalitesi maddelerini içermiyor.');
if (!settingsText.includes('Sürüm ve Kurulum Kontrolü') || !settingsText.includes('register-deployment-client')) errors.push('Ayarlar ekranında kurulum sonrası sürüm kontrol ekranı yok.');
if (!ipcText.includes('deployment:get-status') || !ipcText.includes('deployment:register-client')) errors.push('IPC tarafında ofis sürüm kontrol handlerları yok.');
const officeVersionScript = read('scripts/check-office-versions.ps1');
if (!officeVersionScript.includes('_HASARBOTU_OFFICE') || !officeVersionScript.includes('SetExpected') || !officeVersionScript.includes('RegisterThisPC')) errors.push('check-office-versions.ps1 ofis sürüm standardını uygulamıyor.');
const releaseHashScript = read('scripts/release-hash.ps1');
if (!releaseHashScript.includes('SHA256') || !releaseHashScript.includes('RELEASE_HASHES_SHA256')) errors.push('release-hash.ps1 SHA-256 release çıktısı üretmiyor.');

const ciWorkflow = read('.github/workflows/ci.yml');
for (const needle of ['windows-2022', 'actions/checkout@v6.0.3', 'actions/setup-node@v6.4.0', 'npm.cmd ci --ignore-scripts', 'npm.cmd run fix:electron', 'npm.cmd run ci']) {
  if (!ciWorkflow.includes(needle)) errors.push(`CI workflow beklenen içerik yok: ${needle}`);
}
const releaseWorkflow = read('.github/workflows/release.yml');
for (const needle of ['types: [published]', 'workflow_dispatch', 'permissions:', 'contents: write', 'windows-2022', 'Tag ile package.json sürümünü karşılaştır', 'npm.cmd run dist:win', 'npm.cmd run release:hash', 'npm.cmd run release:notes', 'actions/upload-artifact@v7.0.1', 'gh release upload']) {
  if (!releaseWorkflow.includes(needle)) errors.push(`Release workflow beklenen içerik yok: ${needle}`);
}
for (const needle of ['release/HasarBotu-Baran-Ekspertiz-Kurulum-*.exe', 'release/HasarBotu-Baran-Ekspertiz-Tasinabilir-*.exe', 'RELEASE_HASHES_SHA256.txt', 'RELEASE_NOTES_v*.md', '$assets.Count -ne 2']) {
  if (!releaseWorkflow.includes(needle)) errors.push(`Release workflow kullanıcıya sadece kurulum ve taşınabilir EXE yüklemiyor: ${needle}`);
}
if (/release\/\*\*\/\*\.exe/.test(releaseWorkflow) || /Get-ChildItem ".\\release" -Recurse -File -Include "\*\.exe"/.test(releaseWorkflow)) {
  errors.push('Release workflow tüm EXE dosyalarını yüklüyor; elevate.exe veya unpacked exe kullanıcı assetlerine karışabilir.');
}

if (releaseWorkflow.includes('$installer + $portable')) {
  errors.push('Release workflow PowerShell FileInfo toplama hatası içeriyor; tek EXE döndüğünde op_Addition hatası verir. @() array sarmalı kullanılmalı.');
}
for (const needle of ['@(Get-ChildItem \".\\release\" -File -Filter \"HasarBotu-Baran-Ekspertiz-Kurulum-*.exe\")', '@(Get-ChildItem \".\\release\" -File -Filter \"HasarBotu-Baran-Ekspertiz-Tasinabilir-*.exe\")', '$installer.Count -ne 1', '$portable.Count -ne 1']) {
  if (!releaseWorkflow.includes(needle)) errors.push(`Release workflow PowerShell EXE asset dizisi güvenli değil: ${needle}`);
}

const pilotWindowsScript = read('scripts/pilot-windows-check.ps1');
if (!/^\uFEFF?param\(/.test(pilotWindowsScript)) errors.push('pilot-windows-check.ps1 param bloğu script başında değil; -BuildExe gibi argümanlar Windows PowerShell 5.1 üzerinde güvenilir çalışmayabilir.');
const pilotCopyScript = read('scripts/pilot-copy-month.ps1');
if (!pilotCopyScript.includes('robocopy') || !pilotCopyScript.includes('/E') || /robocopy\s+\$source\s+\$destination[^\r\n]*\/MIR/i.test(pilotCopyScript)) errors.push('pilot-copy-month.ps1 güvenli kopya akışını ihlal ediyor; robocopy /E kullanılmalı ve aktif robocopy komutunda /MIR kullanılmamalı.');
const pilotCollectScript = read('scripts/pilot-collect-diagnostics.ps1');
if (!pilotCollectScript.includes('pilot-diagnostics') || !pilotCollectScript.includes('Compress-Archive') || !pilotCollectScript.includes('IncludeCacheIndex')) errors.push('pilot-collect-diagnostics.ps1 tanı paketi toplama akışını içermiyor.');

const fixScript = read('scripts/fix-electron-win.ps1');
for (const needle of ['ConvertFrom-Json', 'devDependencies.electron', 'win32-x64', 'electron.exe', 'path.txt', 'Invoke-WebRequest']) {
  if (!fixScript.includes(needle)) errors.push(`fix-electron-win.ps1 beklenen içerik yok: ${needle}`);
}
if (fixScript.includes('$electronVersion = "41.7.1"')) errors.push('fix-electron-win.ps1 Electron sürümünü hard-code ediyor; package.json devDependencies.electron okunmalı.');
if (!fixScript.includes('[System.IO.File]::WriteAllText($pathTxt, "electron.exe"')) errors.push('fix-electron-win.ps1 path.txt dosyasını satır sonu olmadan yazmıyor.');

const sourceFiles = collectFiles('src').filter((file) => /\.(ts|html|css)$/.test(file));
for (const file of sourceFiles) {
  const text = read(file);
  if (/API_KEY\s*=|SECRET\s*=|PASSWORD\s*=|TTAMAMEN\s*=/.test(text)) errors.push(`Olası secret sızıntısı: ${file}`);
}
if (fs.existsSync('.env')) errors.push('.env dosyası paket kökünde bulunmamalı.');

// v0.4.1: Renderer hiçbir zaman doğrudan fs/path/electron/os/child_process import etmez.
// Tüm dosya sistemi ve klasör verisi yalnızca güvenli main-process IPC üzerinden gelir.
const rendererTsFiles = collectFiles('src/renderer').filter((file) => file.endsWith('.ts'));
const forbiddenRendererImport = /(?:from\s+|import\s+|require\(\s*)['"](?:node:)?(?:fs|path|electron|os|child_process)['"]/;
for (const file of rendererTsFiles) {
  if (forbiddenRendererImport.test(read(file))) errors.push(`Renderer doğrudan fs/path/electron/os/child_process erişiyor: ${file}`);
}

for (const file of sourceFiles.filter((file) => file.endsWith('.ts'))) {
  checkRelativeImports(file);
}

if (errors.length) {
  console.error('Doğrulama başarısız:');
  for (const error of errors) console.error('-', error);
  process.exit(1);
}
console.log(`Doğrulama geçti. v${pkg.version} build bütünlüğü, Git ignore ankrajı, local-cache kaynakları, corrupt takip koruması, Windows yol karşılaştırması, GitHub Release EXE workflow'u, Windows 10/11 pilot kurulum akışı, Stitch kaynakları, gerçek 2026 alt klasör tarayıcısı, güvenlik ilkesi, güvenli köprü ve public npm kayıt adresi temiz.`);

function collectFiles(root) {
  const out = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) out.push(...collectFiles(full));
    else out.push(full);
  }
  return out;
}

function checkRelativeImports(file) {
  const text = read(file);
  const dir = path.dirname(file);
  const importRegex = /(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?['"](\.\.?\/[^'"]+)['"]/g;
  for (const match of text.matchAll(importRegex)) {
    const spec = match[1];
    if (!spec) continue;
    const base = path.resolve(dir, spec);
    const candidates = [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.mjs`, path.join(base, 'index.ts')];
    if (!candidates.some((candidate) => fs.existsSync(candidate))) {
      errors.push(`Eksik relative import: ${file} -> ${spec}`);
    }
  }
}
