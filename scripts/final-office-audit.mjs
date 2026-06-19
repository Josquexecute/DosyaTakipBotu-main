import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { LocalCacheStore } from '../dist-electron/main/local-cache/local-cache-store.js';
import { PcloudYearScanner } from '../dist-electron/main/scanner/pcloud-year-scanner.js';
import { TrackingFileService } from '../dist-electron/main/tracking/tracking-file-service.js';
import { buildMinimalLaborWorkbook, buildMultiMoneyLaborWorkbook, distributeLaborExcel, inspectLaborExcel, parseMoney, distributeAmounts } from '../dist-electron/main/import/excel-importer.js';
import { exportCaseListToExcel } from '../dist-electron/main/import/case-list-exporter.js';
import { APP_VERSION, inferYearFromRootPath } from '../dist-electron/shared/constants.js';
import { isPathInsideNormalized } from '../dist-electron/shared/path-normalization.js';

const checks = [];
function ok(name) { checks.push({ name, ok: true }); console.log(`TAMAM - ${name}`); }
function fail(name, message) { checks.push({ name, ok: false, message }); console.error(`HATA - ${name}: ${message}`); }
function assert(condition, name, message) { condition ? ok(name) : fail(name, message); }

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'hasarbotu-office-audit-'));
const appData = path.join(root, 'appdata');
const yearRoot = path.join(root, 'pCloud Drive (P)', 'BARAN GLOBAL EKSPERTİZ', '2026');
const pkg = JSON.parse(await fs.readFile('package.json', 'utf-8'));
assert(pkg.version === '0.5.0', 'Paket sürümü v0.5.0 olarak sabitlendi', `version=${pkg.version}`);
assert(APP_VERSION === pkg.version, 'APP_VERSION package.json ile uyumlu', `APP_VERSION=${APP_VERSION}, package=${pkg.version}`);
assert(Boolean(pkg.scripts?.['live:version-check']) && Boolean(pkg.scripts?.['release:hash']) && Boolean(pkg.scripts?.['release:notes']), 'v0.3.14 Windows rollout scriptleri package.json içinde mevcut', JSON.stringify(pkg.scripts));
assert(Boolean(pkg.scripts?.['test:behavior']) && String(pkg.scripts?.ci || '').includes('test:behavior'), 'v0.3.18 davranış regresyon testleri CI zincirine bağlı', JSON.stringify(pkg.scripts));
assert(Boolean(pkg.scripts?.['release:candidate-check']) && Boolean(pkg.scripts?.['release:dry-run']), 'v0.4.0 Production Candidate saha kabul ve dry-run komutları package.json içinde mevcut', JSON.stringify(pkg.scripts));
for (const file of ['src/main/local-cache/local-cache-store.ts', 'src/main/local-cache/local-settings-store.ts', 'src/main/local-cache/thumbnail-cache.ts', 'scripts/check-office-versions.ps1', 'scripts/release-hash.ps1', 'scripts/release-notes.ps1', 'scripts/production-candidate-check.ps1', 'scripts/release-hash.mjs', 'scripts/release-notes.mjs', 'scripts/production-candidate-check.mjs', 'scripts/release-dry-run.mjs', 'src/main/services/ipc-domain-services.ts', 'docs/CANLI_KULLANIM_KILAVUZU.md', 'docs/GERI_DONUS_PLANI.md', 'docs/OFIS_DAGITIM_KONTROL_LISTESI.md', 'docs/V0.4.0_PRODUCTION_CANDIDATE.md']) {
  assert(await pathExists(file), `v0.3.14 operasyon dosyası mevcut: ${file}`, `${file} eksik`);
}
const versionScript = await fs.readFile('scripts/check-office-versions.ps1', 'utf-8');
const candidateScript = await fs.readFile('scripts/production-candidate-check.ps1', 'utf-8');
assert(versionScript.includes('-Force') && versionScript.includes('geriye çekilemez'), 'Ofis hedef sürüm scripti downgrade guard içeriyor', 'check-office-versions.ps1 downgrade guard eksik');
assert(candidateScript.includes('npm.cmd run build') && candidateScript.includes('SkipFreshBuild'), 'Production candidate check fresh build/provenance uyarısı içeriyor', 'production-candidate-check.ps1 fresh build kontrolü eksik');
const releaseWorkflow = await fs.readFile('.github/workflows/release.yml', 'utf-8');
const releaseNotesScript = await fs.readFile('scripts/release-notes.ps1', 'utf-8');
const releaseHashScript = await fs.readFile('scripts/release-hash.ps1', 'utf-8');
const releaseNotesNodeScript = await fs.readFile('scripts/release-notes.mjs', 'utf-8');
const releaseHashNodeScript = await fs.readFile('scripts/release-hash.mjs', 'utf-8');
const releaseDryRunNodeScript = await fs.readFile('scripts/release-dry-run.mjs', 'utf-8');
const candidateCheckScript = await fs.readFile('scripts/production-candidate-check.ps1', 'utf-8');
assert(releaseWorkflow.includes('release:hash') && releaseWorkflow.includes('release:notes') && releaseWorkflow.includes('RELEASE_HASHES_SHA256') && releaseWorkflow.includes('RELEASE_NOTES_v*.md'), 'v0.4.0 GitHub Release EXE ile birlikte SHA-256 ve release notes asset üretir/yükler', 'release workflow hash/not asset eksik');
assert(releaseNotesScript.includes('Production Candidate') && releaseNotesScript.includes('live:backup-tracking') && releaseNotesScript.includes('Claude/Fable'), 'v0.4.0 release notes üretim adayı kabul şartlarını yazar', 'release-notes production candidate metni eksik');
assert(releaseHashScript.includes('Get-HasarBotuSha256Hex') && releaseHashScript.includes('System.Security.Cryptography.SHA256'), 'release-hash.ps1 Get-FileHash olmayan ortam için .NET SHA256 fallback içerir', 'release-hash fallback eksik');
assert(!releaseNotesScript.includes('& powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot \'release-hash.ps1\')'), 'release-notes.ps1 release-hash scriptini aynı PowerShell oturumunda çağırır', 'release-notes powershell child-process bağımlılığı kaldı');
assert(candidateCheckScript.includes('production-candidate-check') && candidateCheckScript.includes('live:preflight') && candidateCheckScript.includes('_HASARBOTU_OFFICE'), 'v0.4.0 saha kabul kontrol scripti preflight/ofis sürüm kayıtlarını denetler', 'production candidate check kapsamı eksik');
assert(releaseHashNodeScript.includes('pathToFileURL') && releaseNotesNodeScript.includes('pathToFileURL'), 'release:hash/release:notes Windows-safe ESM entrypoint guard kullan?yor', 'pathToFileURL guard eksik');
assert(releaseDryRunNodeScript.includes('npm_execpath') && !releaseDryRunNodeScript.includes("'npm.cmd'"), 'release:dry-run Windows/GitHub Actions ortamında npm.cmd spawnSync bağımlılığı kullanmaz', 'release-dry-run npm.cmd spawn bağımlılığı kaldı');
const candidateCheckNodeScript = await fs.readFile('scripts/production-candidate-check.mjs', 'utf-8');
assert(candidateCheckNodeScript.includes('npm_execpath') && !candidateCheckNodeScript.includes("'npm.cmd'"), 'release:candidate-check Node sürümü Windows/GitHub Actions ortamında npm.cmd spawnSync bağımlılığı kullanmaz', 'production-candidate-check.mjs npm.cmd spawn bağımlılığı kaldı');
const ipcContractSource = await fs.readFile('src/shared/ipc-contract.ts', 'utf-8');
const ipcSource = `${await fs.readFile('src/main/ipc.ts', 'utf-8')}\n${ipcContractSource}`;
const ipcDomainSource = `${ipcSource}\n${await fs.readFile('src/main/services/ipc-domain-services.ts', 'utf-8')}\n${await fs.readFile('src/main/services/case-list-helpers.ts', 'utf-8')}\n${await fs.readFile('src/main/services/cases-query-service.ts', 'utf-8')}`;
const cacheSource = await fs.readFile('src/main/local-cache/local-cache-store.ts', 'utf-8');
const fingerprintSource = await fs.readFile('src/main/scanner/folder-fingerprint.ts', 'utf-8');
const rendererSource = await fs.readFile('src/renderer/main.ts', 'utf-8');
assert(ipcDomainSource.includes('trackingSummary') && ipcDomainSource.includes('CASE_LIST_OPEN_TODO_LIMIT'), 'v0.3.15 cases:list payload notes/todos/audit sadeleştirme kodu var', 'trackingSummary veya limit sabiti yok');
assert(ipcDomainSource.includes('writeCaseCache(patched)') && ipcDomainSource.includes('changedCaseCaches'), 'v0.3.15 mutation/refresh tam year-index yerine tekil case cache yazar', 'writeCaseCache mutasyon/refresh yolunda yok');
assert(cacheSource.includes('compactIndexForDisk') && cacheSource.includes('mergeCaseCaches'), 'v0.3.15 persisted year index sadeleştirme ve per-case merge kodu var', 'compact/merge kodu yok');
assert(!fingerprintSource.includes('safeFileSha1') && fingerprintSource.includes('metadata fingerprint'), 'v0.3.15 tracking fingerprint content hash okumuyor', 'safeFileSha1 hâlâ var');
assert(rendererSource.includes('scanRequestInFlight') && rendererSource.includes('THUMBNAIL_LOAD_CONCURRENCY'), 'v0.3.15 renderer çift scan reload ve thumbnail concurrency koruması var', 'scanRequestInFlight veya thumbnail concurrency yok');
const layoutSource = await fs.readFile('src/renderer/app/components/layout.ts', 'utf-8');
const dashboardSource = await fs.readFile('src/renderer/app/components/dashboard.ts', 'utf-8');
const casesSource = await fs.readFile('src/renderer/app/components/cases.ts', 'utf-8');
assert(cacheSource.includes('unsupportedPhotos') && cacheSource.includes('hasMissingPhotoAction'), 'v0.3.16 dashboard HEIC/eksik foto ayrım kodu var', 'unsupportedPhotos veya hasMissingPhotoAction yok');
assert(dashboardSource.includes('data-filter') && dashboardSource.includes('Format Uyarısı'), 'v0.3.16 KPI kartları filtrelenebilir ve format uyarısını ayrı gösterir', 'dashboard filtre/format yok');
assert(layoutSource.includes('selectedCaseVisibleInCurrentList'), 'v0.3.16 filtre dışı seçili dosya rastgele ilk dosyaya düşmez', 'selectedCaseVisibleInCurrentList yok');
assert(ipcSource.includes("cases:refresh-one") && rendererSource.includes('refresh-case'), 'v0.3.16 tek dosya yenile tam yıl scan yerine seçili dosya IPC kullanır', 'cases:refresh-one veya refresh-case yok');
assert(rendererSource.includes('closedMutationUnlocks') && rendererSource.includes('toggle-closed-unlock'), 'v0.3.16 kapalı dosya oturum kilidi var', 'closedMutationUnlocks/toggle yok');
assert(rendererSource.includes('scheduleToastAutoDismiss') && layoutSource.includes('toastKind'), 'v0.3.16 toast severity ve auto-dismiss var', 'toastKind/scheduleToastAutoDismiss yok');
assert(casesSource.includes("case 'photo-format'") && casesSource.includes('hasMissingPhotoAction'), 'v0.3.16 liste filtreleri unsupported format ile eksik fotoğrafı ayırır', 'photo-format filtre yok');
assert(casesSource.includes('export-cases-excel') && rendererSource.includes('exportFilteredCasesExcel'), 'v0.3.17 filtrelenmiş liste Excel export UI ve renderer akışı var', 'export-cases-excel/exportFilteredCasesExcel yok');
const excelSource = await fs.readFile('src/main/import/excel-importer.ts', 'utf-8');
assert(excelSource.includes('availableColumns') && excelSource.includes('allowFormulaReplacement') && excelSource.includes('allowEqualDistribution'), 'v0.3.17 Excel manuel kolon, formül ve eşit dağıtım onayları üretim kodunda var', 'Excel onay/kolon kodu yok');
const preloadSource = `${await fs.readFile('src/preload/preload.ts', 'utf-8')}\n${ipcContractSource}`;
assert(ipcSource.includes('cases:export-excel') && preloadSource.includes('exportCaseListExcel'), 'v0.3.17 Excel liste export IPC/preload hattı var', 'cases:export-excel veya exportCaseListExcel yok');

const trackingServiceSource = await fs.readFile('src/main/tracking/tracking-file-service.ts', 'utf-8');
const detailComponentSource = await fs.readFile('src/renderer/app/components/detail.ts', 'utf-8');
assert(trackingServiceSource.includes('Yerel taraf aynı öğeyi düzenlediyse') && trackingServiceSource.includes('merged.push(l)'), 'v0.3.18 mergeArrayById local-edit vs disk-delete kaybını korumaya aldı', 'mergeArrayById koruma izi yok');
assert(excelSource.includes('export function parseMoney') && excelSource.includes('export function distributeAmounts'), 'v0.3.18 para dağıtım yardımcıları davranış testine açıldı', 'parseMoney/distributeAmounts export yok');
assert(detailComponentSource.includes('Risk Kontrol') && !detailComponentSource.includes('Yapay Zekâ'), 'v0.3.18 yanıltıcı Yapay Zekâ metni Risk Kontrol olarak değişti', 'Risk Kontrol etiketi yok veya Yapay Zekâ metni kaldı');
assert(detailComponentSource.includes('CLAIM_TYPES') && detailComponentSource.includes('WORKFLOW_STATUSES') && detailComponentSource.includes('PRIORITIES'), 'RC5 renderer dropdownları shared workflow constants kullanıyor', 'detail.ts shared constants importları eksik');
assert(!detailComponentSource.includes("['Yeni Dosya'") && !detailComponentSource.includes("['unknown','trafik','kasko'") && !detailComponentSource.includes("['Düşük','Normal','Yüksek','Kritik']"), 'RC5 renderer kritik dropdown dizileri hardcoded değil', 'detail.ts içinde hardcoded dropdown dizisi kaldı');
assert((casesSource.match(/data-action=\"export-cases-excel\"/g) ?? []).length === 1 && casesSource.includes('renderCaseListHeader(filtered.length, modeText)'), 'RC5 liste Excel export butonu tek ortak header kaynağından render edilir', 'export-cases-excel tekrar sayısı hatalı');
const rollbackDocSource = await fs.readFile('docs/GERI_DONUS_PLANI.md', 'utf-8');
assert(rollbackDocSource.includes('Disk Baseline Kabul') && rollbackDocSource.includes('local write-index baseline'), 'RC5 rollback dokümanı Disk Baseline Kabul adımını içeriyor', 'Disk Baseline Kabul dokümanı eksik');
assert(isPathInsideNormalized('P:\\BARAN GLOBAL EKSPERTIZ\\2026\\06ABC123', 'P:\\BARAN GLOBAL EKSPERTİZ\\2026'), 'RC5 Türkçe İ/I farkı güvenli path kontrolünde kabul edilir', 'EKSPERTIZ/EKSPERTİZ path kıyası başarısız');
assert(inferYearFromRootPath('P:\\BARAN GLOBAL EKSPERTİZ\\2027') === 2027, 'RC5 seçili rootPath içinden 2027 cache yılı çıkarılır', `year=${inferYearFromRootPath('P:\\BARAN GLOBAL EKSPERTİZ\\2027')}`);
for (const deadFile of ['src/main/scanner/background-refresh-service.ts', 'src/main/scanner/pcloud-change-detector.ts', 'src/main/local-cache/local-case-index.ts', 'src/main/import/pdf-analyzer.ts']) {
  assert(!(await pathExists(deadFile)), `v0.3.18 dead code temizlendi: ${deadFile}`, `${deadFile} hâlâ mevcut`);
}
assert(parseMoney('1.234,56 TL') === 1234.56 && parseMoney('1,234.56') === 1234.56, 'v0.3.18 parseMoney Türkçe/İngilizce para formatlarını okuyor', JSON.stringify({ tr: parseMoney('1.234,56 TL'), en: parseMoney('1,234.56') }));
assert(distributeAmounts([100, 200, 300], 1200).join(',') === '200,400,600', 'v0.3.18 distributeAmounts oranlı dağıtım unit kontrolü', distributeAmounts([100, 200, 300], 1200).join(','));


async function mkdir(rel) { await fs.mkdir(path.join(yearRoot, rel), { recursive: true }); }
async function write(rel, data = 'test') {
  const filePath = path.join(yearRoot, rel);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, data);
}

await fs.mkdir(yearRoot, { recursive: true });
await write('DOSYA TAKİP LİSTESİ.xlsx', 'liste');
await mkdir('Nisan 2026/ŞABLONLAR');
await mkdir('Nisan 2026/ORTAK BELGELER');
await mkdir('Nisan 2026/34BOP660 - DOSYA NO 2026-847291/EVRAK');
await mkdir('Nisan 2026/34BOP660 - DOSYA NO 2026-847291/HASAR');
await mkdir('Nisan 2026/34BOP660 - DOSYA NO 2026-847291/olayyeri');
await mkdir('Nisan 2026/34BOP660 - DOSYA NO 2026-847291/ONARIM');
await write('Nisan 2026/34BOP660 - DOSYA NO 2026-847291/EVRAK/M RUHSAT.jpeg', Buffer.from([0xff, 0xd8, 0xff, 0xdb]));
await write('Nisan 2026/34BOP660 - DOSYA NO 2026-847291/EVRAK/M EHLİYET.jpg', Buffer.from([0xff, 0xd8, 0xff, 0xdb]));
await write('Nisan 2026/34BOP660 - DOSYA NO 2026-847291/EVRAK/M ALKOL RAPORU.pdf', '%PDF');
await write('Nisan 2026/34BOP660 - DOSYA NO 2026-847291/EVRAK/M POLİÇE.pdf', '%PDF');
await write('Nisan 2026/34BOP660 - DOSYA NO 2026-847291/EVRAK/S POLİÇE.pdf', '%PDF');
await write('Nisan 2026/34BOP660 - DOSYA NO 2026-847291/EVRAK/S RUHSAT.jpeg', Buffer.from([0xff, 0xd8, 0xff, 0xdb]));
await write('Nisan 2026/34BOP660 - DOSYA NO 2026-847291/EVRAK/S EHLİYET.JPG', Buffer.from([0xff, 0xd8, 0xff, 0xdb]));
await write('Nisan 2026/34BOP660 - DOSYA NO 2026-847291/EVRAK/KTT.jpg', Buffer.from([0xff, 0xd8, 0xff, 0xdb]));
await write('Nisan 2026/34BOP660 - DOSYA NO 2026-847291/EVRAK/TRAMER SONUCU.pdf', '%PDF');
await write('Nisan 2026/34BOP660 - DOSYA NO 2026-847291/EVRAK/AĞIR HASAR ÖN RAPOR.pdf', '%PDF');
await write('Nisan 2026/34BOP660 - DOSYA NO 2026-847291/EVRAK/27-17777381.pdf', '%PDF');
await write('Nisan 2026/34BOP660 - DOSYA NO 2026-847291/EVRAK/Faturalar/2026/Mayıs/Servis/Derin Evrak.pdf', '%PDF');
await write('Nisan 2026/34BOP660 - DOSYA NO 2026-847291/HASAR/HASAR 1.jpg', Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x01]));
await write('Nisan 2026/34BOP660 - DOSYA NO 2026-847291/HASAR/KM.jpg', Buffer.from([0xff, 0xd8, 0xff, 0xdb]));
await write('Nisan 2026/34BOP660 - DOSYA NO 2026-847291/HASAR/VİTES.jpg', Buffer.from([0xff, 0xd8, 0xff, 0xdb]));
await write('Nisan 2026/34BOP660 - DOSYA NO 2026-847291/HASAR/ŞASE.jpg', Buffer.from([0xff, 0xd8, 0xff, 0xdb]));
await write('Nisan 2026/34BOP660 - DOSYA NO 2026-847291/HASAR/EK FORMAT.HEIC', 'heic-preview-unsupported');
await write('Nisan 2026/34BOP660 - DOSYA NO 2026-847291/HASAR/BOZUK.JPG', 'bozuk');
for (let i = 2; i <= 130; i += 1) await write(`Nisan 2026/34BOP660 - DOSYA NO 2026-847291/HASAR/HASAR ${i}.jpg`, Buffer.from([0xff, 0xd8, 0xff, 0xdb, i % 255]));
for (const plate of ['01FJG08', '06GE8676', '21ACE111', '34MPB278', '34SZM72', '72ADB474', '72DN951']) await mkdir(`Nisan 2026/KAPALI NİSAN 2026/${plate}/EVRAK`);
await mkdir('Nisan 2026/KAPALI NİSAN 2026/_HASARBOTU');
await mkdir('Mayıs 2026/72ABC123/EVRAK');
await mkdir('Haziran 2026/56ABG710/EVRAK');

const cache = new LocalCacheStore(appData);
const scanner = new PcloudYearScanner(cache);
const settings = {
  rootPath: yearRoot,
  rootPathConfirmed: true,
  theme: 'light',
  zoom: 1,
  activeUser: 'Denetim Kullanıcısı',
  activeComputer: 'DENETIM-PC',
  users: ['Denetim Kullanıcısı', 'Ömer Faruk İşleyen', 'Enes Özmen', 'Baran Gürbüz'],
  scanIntervals: { fullYearLightMs: 300000 }
};
const { index, report } = await scanner.scan(settings);
assert(report.rootAvailable === true, 'Ana klasör okunabiliyor', 'rootAvailable false döndü');
assert(report.createdTrackingFiles === 0, 'v0.4.0 RC2 scan sırasında default takip.json oluşturmaz', `createdTrackingFiles=${report.createdTrackingFiles}`);
assert(index.cases.length === 10, 'Gerçek klasör yapısında tüm dosyalar listeleniyor', `Beklenen 10, gelen ${index.cases.length}`);
assert(!index.cases.some((item) => /ŞABLONLAR|ORTAK BELGELER/.test(item.folderPath)), 'Dosya olmayan ortak klasörler listeye alınmıyor', 'ŞABLONLAR/ORTAK BELGELER dosya listesine girdi');
const nonCaseTracking = await pathExists(path.join(yearRoot, 'Nisan 2026', 'ŞABLONLAR', '_HASARBOTU')) || await pathExists(path.join(yearRoot, 'Nisan 2026', 'ORTAK BELGELER', '_HASARBOTU'));
assert(nonCaseTracking === false, 'Dosya olmayan klasörlere _HASARBOTU yazılmıyor', 'Ortak/şablon klasörüne _HASARBOTU oluşturuldu');
assert(!index.cases.some((item) => item.plate.includes('KAPALI') || item.folderPath.endsWith('_HASARBOTU')), 'KAPALI ay ve _HASARBOTU dosya sayılmıyor', 'Konteyner/sistem klasörü dosya listesine girdi');
assert(index.cases.filter((item) => item.isClosedFolder).length === 7, 'Kapalı ay altındaki dosyalar kapalı işaretleniyor', 'Kapalı dosya sayısı hatalı');
const mainCase = index.cases.find((item) => item.plate === '34BOP660');
assert(Boolean(mainCase), 'Açık dosya klasörü bulundu', '34BOP660 bulunamadı');
if (mainCase) {
  assert(mainCase.dosyaNo === '2026-847291', 'Klasör adından dosya numarası ayrıştırılıyor', `dosyaNo=${mainCase.dosyaNo}`);
  assert(mainCase.searchText.includes('2026 847291'), 'Dosya numarası arama indeksine giriyor', mainCase.searchText);
  assert(mainCase.documentAnalysis.claimNoticeNo === '27-17777381', 'İhbar föyü numarası EVRAK PDF adından okunuyor', `claimNoticeNo=${mainCase.documentAnalysis.claimNoticeNo}`);
  assert(mainCase.claimNoticeNo === '27-17777381', 'İhbar föyü numarası dosya listesi indeksine giriyor', `claimNoticeNo=${mainCase.claimNoticeNo}`);
  assert(mainCase.searchText.includes('27 17777381'), 'İhbar föyü numarası arama indeksine giriyor', mainCase.searchText);
  const olayGroup = mainCase.folderContents.groups.find((group) => group.key === 'OLAY YERİ');
  assert(olayGroup?.exists === true, 'OLAY YERİ klasörü küçük harf/bitişik yazılsa da tanınıyor', JSON.stringify(olayGroup));
  assert(mainCase.documentAnalysis.claimType === 'trafik', 'EVRAK trafik/kasko analizi trafik dosyasını tanıyor', `claimType=${mainCase.documentAnalysis.claimType}`);
  assert(mainCase.documentAnalysis.missingCritical.length === 0, 'Zorunlu trafik evrakları tamam algılanıyor', mainCase.documentAnalysis.missingCritical.join(', '));
  const evrakGroup = mainCase.folderContents.groups.find((group) => group.key === 'EVRAK');
  assert(evrakGroup?.sampleFiles.some((name) => name.includes('Derin Evrak.pdf')) === true, 'Derin alt klasördeki evrak dosyası okunuyor', JSON.stringify(evrakGroup));
  assert(!mainCase.searchText.includes('UNDEFINED'), 'Arama indeksi undefined metni üretmiyor', mainCase.searchText);
  assert(mainCase.photoAnalysis.damagePhotoCount >= 130 && mainCase.photoAnalysis.hasKm && mainCase.photoAnalysis.hasVites && mainCase.photoAnalysis.hasSaseOrSasi, 'HASAR fotoğraf kontrolü 120 üzeri fotoğrafı atlamıyor', JSON.stringify(mainCase.photoAnalysis));
  assert(mainCase.photoAnalysis.unsupportedFiles.some((name) => /HEIC/i.test(name)), 'v0.3.16 HEIC/RAW format uyarısı eksik fotoğraftan ayrı yakalanıyor', JSON.stringify(mainCase.photoAnalysis.unsupportedFiles));
  assert(mainCase.photoAnalysis.previews.length >= 130, 'Fotoğraf önizleme listesi 120 ile sınırlanmıyor', `previews=${mainCase.photoAnalysis.previews.length}`);
  assert(mainCase.photoAnalysis.corruptSuspects.some((name) => name.includes('BOZUK')), 'Bozuk fotoğraf header kontrolü çalışıyor', 'BOZUK.JPG corruptSuspects içine girmedi');
}

const dashboard = cache.buildDashboard(index, true);
const rawPhotoWarningCases = index.cases.filter((item) => item.photoAnalysis.warnings.length > 0).length;
assert(dashboard.unsupportedPhotos >= 1, 'v0.3.16 dashboard unsupported fotoğraf formatını ayrı KPI sayar', `unsupportedPhotos=${dashboard.unsupportedPhotos}`);
assert(dashboard.missingPhotos < rawPhotoWarningCases, 'v0.3.16 eksik fotoğraf KPI HEIC/kapalı dosya uyarılarıyla şişmez', `missingPhotos=${dashboard.missingPhotos}, rawWarnings=${rawPhotoWarningCases}`);
assert(dashboard.portalPending < index.cases.length, 'v0.3.16 portal bekleyen KPI kapalı dosyalarla şişmez', `portalPending=${dashboard.portalPending}, cases=${index.cases.length}`);

const rawDiskIndex = JSON.parse(await fs.readFile(cache.indexPath(), 'utf-8'));
const rawDiskMainCase = rawDiskIndex.cases.find((item) => item.plate === '34BOP660');
assert(Array.isArray(rawDiskMainCase?.tracking?.audit) && rawDiskMainCase.tracking.audit.length === 0, 'v0.3.15 disk year index tracking.audit taşımaz', JSON.stringify(rawDiskMainCase?.tracking?.audit ?? null));
assert((rawDiskMainCase?.photoAnalysis?.previews?.length ?? 999) <= 48, 'v0.3.15 disk year index foto preview sınırı uygular', `previews=${rawDiskMainCase?.photoAnalysis?.previews?.length}`);
assert((rawDiskMainCase?.folderContents?.groups ?? []).every((group) => (group.sampleFiles?.length ?? 0) <= 16), 'v0.3.15 disk year index sampleFiles sınırı uygular', JSON.stringify(rawDiskMainCase?.folderContents?.groups ?? []));
if (mainCase) {
  const cachedPatch = structuredClone(mainCase);
  cachedPatch.serviceName = 'Tekil cache servis';
  cachedPatch.tracking.service.name = 'Tekil cache servis';
  cachedPatch.tracking.audit = Array.from({ length: 25 }, (_, index) => ({ at: new Date().toISOString(), by: 'Denetçi', computer: 'DENETIM-PC', action: 'cache-test', text: `Cache test ${index}` }));
  await cache.writeCaseCache(cachedPatch);
  const mergedIndex = await cache.readIndex();
  const mergedCase = mergedIndex?.cases.find((item) => item.folderPath === mainCase.folderPath);
  const rawCaseCache = JSON.parse(await fs.readFile(cache.caseCachePath(mainCase.folderPath), 'utf-8'));
  assert(mergedCase?.serviceName === 'Tekil cache servis', 'v0.3.15 readIndex tekil case cache dosyasını ana index üzerine merge eder', `serviceName=${mergedCase?.serviceName}`);
  assert(Array.isArray(rawCaseCache.tracking.audit) && rawCaseCache.tracking.audit.length === 0, 'v0.3.15 tekil case cache audit taşımadan yazılır', JSON.stringify(rawCaseCache.tracking.audit));
  const orphanCache = structuredClone(mainCase);
  orphanCache.folderPath = path.join(yearRoot, 'Nisan 2026', 'SILINMIS-GHOST-CASE');
  orphanCache.plate = '99GHOST';
  orphanCache.tracking.caseIdentity.folderPath = orphanCache.folderPath;
  orphanCache.tracking.caseIdentity.plate = orphanCache.plate;
  orphanCache.tracking.metadata.revision += 100;
  orphanCache.serviceName = 'Ghost cache servis';
  await cache.writeCaseCache(orphanCache);
  const ghostMerge = await cache.readIndex(2026);
  assert(!ghostMerge?.cases.some((item) => item.folderPath === orphanCache.folderPath), 'RC5 orphan per-case cache ghost case olarak listeye geri dönmez', JSON.stringify(ghostMerge?.cases.map((item) => item.folderPath)));
  await cache.writeIndex(ghostMerge, 2026);
  assert(!(await pathExists(cache.caseCachePath(orphanCache.folderPath))), 'RC5 orphan per-case AppData cache prune edilir', cache.caseCachePath(orphanCache.folderPath));
}

const service = new TrackingFileService(cache.locksDir);
const casePath = path.join(yearRoot, 'Nisan 2026', '34BOP660 - DOSYA NO 2026-847291');
let tracking = await service.readExisting(casePath);
assert(tracking === null, 'Tarama discovery sırasında takip.json yazmaz; ilk kullanıcı işlemine kadar disk kaydı yoktur', `tracking=${tracking ? 'var' : 'null'}`);
const createResult = await service.mutate(casePath, 1, '', settings.activeUser, (t) => { t.assignment.eksper = 'Baran Gürbüz'; });
assert(!('conflict' in createResult), 'İlk kullanıcı mutasyonu eksik takip.json dosyasını güvenli şekilde oluşturur', JSON.stringify(createResult));
tracking = await service.readExisting(casePath);
assert(Boolean(tracking), 'takip.json ilk kullanıcı mutasyonunda oluşturulup okunuyor', 'tracking null');
assert(tracking?.assignment.sorumlu !== settings.activeUser, 'Dosya sorumlusu aktif kullanıcıdan bağımsız', `sorumlu=${tracking?.assignment.sorumlu}, aktif=${settings.activeUser}`);
assert(tracking?.assignment.sorumlu === 'Atanmadı', 'Yeni dosyada sorumlu otomatik kullanıcı yapılmıyor', `sorumlu=${tracking?.assignment.sorumlu}`);
if (tracking) {
  const beforeRevision = tracking.metadata.revision;
  const beforeWriteId = tracking.metadata.writeId;
  assert(Boolean(beforeWriteId), 'Tracking writeId varsayılan dosyada mevcut', `writeId=${beforeWriteId}`);
  const assignResult = await service.mutate(casePath, beforeRevision, beforeWriteId, settings.activeUser, (t) => { t.assignment.sorumlu = 'Enes Özmen'; t.caseIdentity.officeFileNo = '2026/18'; t.caseIdentity.claimNoticeNo = '27-17777381'; });
  assert(!('conflict' in assignResult), 'Dosya sorumlusu takip.json içine yazılıyor', 'Sorumlu güncellemesinde conflict döndü');
  tracking = await service.readExisting(casePath);
  assert(tracking?.assignment.sorumlu === 'Enes Özmen', 'Seçili dosya sorumlusu diskte kalıyor', `sorumlu=${tracking?.assignment.sorumlu}`);
  assert(tracking?.caseIdentity.officeFileNo === '2026/18', 'Ofis dosya no takip.json içine yazılıyor', `officeFileNo=${tracking?.caseIdentity.officeFileNo}`);
  assert(Boolean(tracking?.metadata.writeId) && tracking?.metadata.writeId !== beforeWriteId, 'Her başarılı yazmada writeId değişiyor', `onceki=${beforeWriteId}, yeni=${tracking?.metadata.writeId}`);
  assert(!(await pathExists(`${service.getTrackingPath(casePath)}.lock`)), '_HASARBOTU içinde lock dosyası oluşturulmuyor', 'takip.json.lock pCloud tarafında oluştu');
  assert(await pathExists(cache.locksDir), 'Lock kökü AppData local-cache içinde hazırlanıyor', cache.locksDir);
  const syncScan = await scanner.scan(settings);
  const syncedCase = syncScan.index.cases.find((item) => item.folderPath === casePath);
  assert(syncedCase?.sorumlu === 'Enes Özmen', 'Dosya sorumlusu diğer bilgisayar değişikliği manuel taramada güncelleniyor', `sorumlu=${syncedCase?.sorumlu}`);
  assert(syncedCase?.officeFileNo === '2026/18', 'Ofis dosya no manuel taramada güncelleniyor', `officeFileNo=${syncedCase?.officeFileNo}`);
  assert(syncedCase?.corruptTracking !== true, 'Tracking cache farkı corruptTracking olarak işaretlenmiyor', `corruptTracking=${syncedCase?.corruptTracking}`);
}
if (tracking) {
  let result = await service.mutate(casePath, tracking.metadata.revision, tracking.metadata.writeId, 'Denetçi', (t) => {
    t.todos.push({ id: 'audit-todo', title: 'Portal yükleme kontrolü', completed: false, priority: 'Normal', assignedTo: 'Ömer Faruk İşleyen', dueDate: '2026-06-10', createdAt: new Date().toISOString() });
  });
  assert(!('conflict' in result), 'To-do ekleme çalışıyor', 'Conflict döndü');
  tracking = await service.readExisting(casePath);
  assert(tracking?.todos.some((todo) => todo.id === 'audit-todo'), 'To-do takip.json içine yazılıyor', 'Eklenen görev bulunamadı');
  result = await service.mutate(casePath, tracking.metadata.revision, tracking.metadata.writeId, 'Denetçi', (t) => { const todo = t.todos.find((x) => x.id === 'audit-todo'); if (todo) { todo.title = 'Portal kontrolü güncellendi'; todo.completed = true; } });
  tracking = await service.readExisting(casePath);
  assert(tracking?.todos.find((todo) => todo.id === 'audit-todo')?.completed === true, 'To-do düzenleme/tamamlandı çalışıyor', 'Görev güncellenmedi');
  result = await service.mutate(casePath, tracking.metadata.revision, tracking.metadata.writeId, 'Denetçi', (t) => { t.todos = t.todos.filter((x) => x.id !== 'audit-todo'); });
  tracking = await service.readExisting(casePath);
  assert(!tracking?.todos.some((todo) => todo.id === 'audit-todo'), 'To-do silme çalışıyor', 'Görev silinmedi');

  result = await service.mutate(casePath, tracking.metadata.revision, tracking.metadata.writeId, 'Denetçi', (t) => { t.notes.push({ id: 'audit-note', createdAt: new Date().toISOString(), createdBy: 'Denetçi', text: 'İlk not' }); });
  tracking = await service.readExisting(casePath);
  assert(tracking?.notes.some((note) => note.id === 'audit-note'), 'Not ekleme çalışıyor', 'Not eklenmedi');
  result = await service.mutate(casePath, tracking.metadata.revision, tracking.metadata.writeId, 'Denetçi', (t) => { const note = t.notes.find((x) => x.id === 'audit-note'); if (note) note.text = 'Güncel not'; });
  tracking = await service.readExisting(casePath);
  assert(tracking?.notes.find((note) => note.id === 'audit-note')?.text === 'Güncel not', 'Not düzenleme çalışıyor', 'Not güncellenmedi');
  result = await service.mutate(casePath, tracking.metadata.revision, tracking.metadata.writeId, 'Denetçi', (t) => { t.notes = t.notes.filter((x) => x.id !== 'audit-note'); });
  tracking = await service.readExisting(casePath);
  assert(!tracking?.notes.some((note) => note.id === 'audit-note'), 'Not silme çalışıyor', 'Not silinmedi');

  result = await service.mutate(casePath, tracking.metadata.revision, tracking.metadata.writeId, 'Denetçi', (t) => { t.labor.parcaListesiIstendi = true; t.labor.parcaKodlariIstendi = true; t.labor.parcaIscilikGirildi = true; t.labor.not = 'İşçilik girişi kontrol edildi.'; });
  tracking = await service.readExisting(casePath);
  assert(tracking?.labor.parcaIscilikGirildi === true && tracking.labor.not.includes('kontrol'), 'Parça/işçilik takip alanları çalışıyor', 'Labor alanları yazılmadı');

  const pastFollowUp = '2026-06-10';
  result = await service.mutate(casePath, tracking.metadata.revision, tracking.metadata.writeId, 'Denetçi', (t) => { t.assignment.takipTarihi = pastFollowUp; });
  tracking = await service.readExisting(casePath);
  result = await service.mutate(casePath, tracking.metadata.revision, tracking.metadata.writeId, 'Denetçi', (t) => { t.notes.push({ id: 'followup-note', createdAt: new Date().toISOString(), createdBy: 'Denetçi', text: 'Takip tarihi korunmalı.' }); });
  tracking = await service.readExisting(casePath);
  assert(tracking?.assignment.takipTarihi === pastFollowUp, 'Takip tarihi mutasyonda otomatik bugüne çekilmiyor', `takipTarihi=${tracking?.assignment.takipTarihi}`);
  assert(/^\d{4}-\d{2}-\d{2}$/.test(tracking?.assignment.sonIslemTarihi ?? ''), 'Son işlem tarihi mutasyonda güncelleniyor', `sonIslemTarihi=${tracking?.assignment.sonIslemTarihi}`);

  // Hotfix 6: audit geçmişi sınırsız büyümemeli.
  tracking = await service.readExisting(casePath);
  if (tracking) {
    tracking.audit = Array.from({ length: 510 }, (_, index) => ({
      at: new Date(Date.now() - (510 - index) * 1000).toISOString(),
      by: 'Denetçi',
      computer: 'DENETIM-PC',
      action: 'audit-fill',
      text: `Audit dolgu ${index}`
    }));
    await fs.writeFile(service.getTrackingPath(casePath), JSON.stringify(tracking, null, 2), 'utf-8');
    const cappedResult = await service.mutate(casePath, tracking.metadata.revision, tracking.metadata.writeId, 'Denetçi', (t) => {
      t.notes.push({ id: 'audit-cap-note', createdAt: new Date().toISOString(), createdBy: 'Denetçi', text: 'Audit cap kontrolü' });
    });
    assert(!('conflict' in cappedResult), 'Audit cap mutasyonu conflict üretmeden çalışıyor', 'Audit cap testinde conflict döndü');
    tracking = await service.readExisting(casePath);
    assert((tracking?.audit.length ?? 0) <= 500, 'Audit geçmişi 500 kayıtla sınırlandırılıyor', `audit=${tracking?.audit.length}`);
  }
}

// Hotfix 5: aynı revision/farklı writeId sessizce normal sayılmamalı.
const baselineBeforeDivergence = await scanner.scan(settings);
let divergenceTracking = await service.readExisting(casePath);
if (divergenceTracking) {
  const sameRevision = divergenceTracking.metadata.revision;
  const baselineWriteId = divergenceTracking.metadata.writeId;
  divergenceTracking.metadata.writeId = randomUUID();
  await fs.writeFile(service.getTrackingPath(casePath), JSON.stringify(divergenceTracking, null, 2), 'utf-8');
  const divergenceScan = await scanner.scan(settings);
  const divergenceCase = divergenceScan.index.cases.find((item) => item.folderPath === casePath);
  assert(baselineBeforeDivergence.index.cases.some((item) => item.folderPath === casePath), 'Divergence öncesi write index taramayla kaydediliyor', 'Ana case baseline indexte yok');
  assert(divergenceScan.report.issues.some((issue) => issue.type === 'same-revision-different-write'), 'Aynı revizyon/farklı writeId scan issue üretiyor', JSON.stringify(divergenceScan.report.issues));
  assert(divergenceCase?.caseIssues?.some((issue) => issue.type === 'same-revision-different-write'), 'Aynı revizyon/farklı writeId dosya sorunlarına ekleniyor', JSON.stringify(divergenceCase?.caseIssues ?? []));
  assert(divergenceCase?.tracking.metadata.revision === sameRevision && divergenceCase?.tracking.metadata.writeId === baselineWriteId, 'Same-revision divergence disk verisiyle cache sessizce değiştirilmeden durduruluyor', `rev=${divergenceCase?.tracking.metadata.revision}, writeId=${divergenceCase?.tracking.metadata.writeId}`);
}

// v0.3.13: diskte daha düşük revision görülürse cache sessizce regressed takip dosyasını kabul etmemeli.
const regressionBaseline = await scanner.scan(settings);
const regressionBefore = regressionBaseline.index.cases.find((item) => item.folderPath === casePath);
let regressionTracking = await service.readExisting(casePath);
if (regressionBefore && regressionTracking) {
  const safeRevision = regressionBefore.tracking.metadata.revision;
  const safeWriteId = regressionBefore.tracking.metadata.writeId;
  regressionTracking.metadata.revision = 1;
  regressionTracking.metadata.writeId = randomUUID();
  await fs.writeFile(service.getTrackingPath(casePath), JSON.stringify(regressionTracking, null, 2), 'utf-8');
  const regressionScan = await scanner.scan(settings);
  const regressionCase = regressionScan.index.cases.find((item) => item.folderPath === casePath);
  assert(regressionScan.report.issues.some((issue) => issue.type === 'revision-regression'), 'Revision regression scan issue üretiyor', JSON.stringify(regressionScan.report.issues));
  assert(regressionCase?.caseIssues?.some((issue) => issue.type === 'revision-regression'), 'Revision regression dosya sorunlarına ekleniyor', JSON.stringify(regressionCase?.caseIssues ?? []));
  assert(regressionCase?.tracking.metadata.revision === safeRevision && regressionCase?.tracking.metadata.writeId === safeWriteId, 'Revision regression disk verisiyle cache sessizce değiştirilmeden durduruluyor', `rev=${regressionCase?.tracking.metadata.revision}, writeId=${regressionCase?.tracking.metadata.writeId}`);
}

// Hotfix 5: pCloud conflicted takip kopyası okunabilir ve Sorunlar paneline kaynak olacak şekilde raporlanır.
const conflictBase = await service.readExisting(casePath);
if (conflictBase) {
  const conflictCopy = structuredClone(conflictBase);
  conflictCopy.metadata.writeId = randomUUID();
  conflictCopy.notes.push({ id: 'conflict-copy-note', createdAt: new Date().toISOString(), createdBy: 'PC-2', text: 'Conflict kopyasından gelen not' });
  const conflictFileName = 'takip (pCloud conflicted copy).json';
  await fs.writeFile(path.join(path.dirname(service.getTrackingPath(casePath)), conflictFileName), JSON.stringify(conflictCopy, null, 2), 'utf-8');
  const conflictScan = await scanner.scan(settings);
  const conflictCase = conflictScan.index.cases.find((item) => item.folderPath === casePath);
  const conflictInspection = await service.inspectFirstConflictCopy(casePath);
  assert(conflictScan.report.issues.some((issue) => issue.type === 'pcloud-conflict-copy'), 'pCloud conflicted tracking kopyası scan issue üretiyor', JSON.stringify(conflictScan.report.issues));
  assert(conflictCase?.caseIssues?.some((issue) => issue.type === 'pcloud-conflict-copy'), 'pCloud conflicted tracking kopyası dosya sorunlarına ekleniyor', JSON.stringify(conflictCase?.caseIssues ?? []));
  assert(conflictInspection?.fileName === conflictFileName && conflictInspection.conflictTracking.notes.some((note) => note.id === 'conflict-copy-note'), 'Conflict tracking kopyası merge akışı için okunuyor', JSON.stringify(conflictInspection));
}

// Bozuk takip.json ana dosya yerinde kalmalı; rename/default yeniden oluşturma yapılmamalı.
const corruptCasePath = path.join(yearRoot, 'Haziran 2026', '56ABG710');
const corruptTrackingPath = service.getTrackingPath(corruptCasePath);
await fs.mkdir(path.dirname(corruptTrackingPath), { recursive: true });
await fs.writeFile(corruptTrackingPath, '{ yarim json', 'utf-8');
const corruptScan1 = await scanner.scan(settings);
const corruptScan2 = await scanner.scan(settings);
const corruptContent = await fs.readFile(corruptTrackingPath, 'utf-8');
const corruptEntries = await fs.readdir(path.dirname(corruptTrackingPath));
assert(corruptContent === '{ yarim json', 'Bozuk takip.json rename/default ile ezilmiyor', corruptContent);
assert(corruptEntries.some((name) => /^takip\.json\.corrupt-.*\.bak$/.test(name)), 'Bozuk takip.json için kopya yedek alınıyor', corruptEntries.join(', '));
assert(corruptScan1.report.issues.some((issue) => issue.type === 'corrupt-tracking') || corruptScan2.report.issues.some((issue) => issue.type === 'corrupt-tracking'), 'Bozuk takip.json scan issue olarak raporlanıyor', JSON.stringify(corruptScan2.report.issues));

// Desteklenmeyen yeni schema dosyası corrupt sayılıp default ile ezilmemeli.
const unsupportedCasePath = path.join(yearRoot, 'Mayıs 2026', '72ABC123');
const unsupportedTrackingPath = service.getTrackingPath(unsupportedCasePath);
await fs.mkdir(path.dirname(unsupportedTrackingPath), { recursive: true });
await fs.writeFile(unsupportedTrackingPath, JSON.stringify({ schemaVersion: 2, revision: 99 }, null, 2), 'utf-8');
const unsupportedScan = await scanner.scan(settings);
const unsupportedContent = JSON.parse(await fs.readFile(unsupportedTrackingPath, 'utf-8'));
assert(unsupportedContent.schemaVersion === 2 && unsupportedContent.revision === 99, 'Desteklenmeyen schema dosyası read-only korunuyor', JSON.stringify(unsupportedContent));
assert(unsupportedScan.report.issues.some((issue) => issue.type === 'unsupported-schema'), 'Desteklenmeyen schema scan issue olarak raporlanıyor', JSON.stringify(unsupportedScan.report.issues));

// v0.3.13: _HASARBOTU var ama takip.json yoksa scan sırasında default takip oluşturulmaz.
const partialCaseRel = 'Temmuz 2026/06XYZ123';
await mkdir(`${partialCaseRel}/EVRAK`);
await write(`${partialCaseRel}/EVRAK/M RUHSAT.pdf`, '%PDF');
await write(`${partialCaseRel}/_HASARBOTU/HASARBOTU_TAKIP_OZETI.txt`, 'partial-sync marker');
const partialTrackingPath = path.join(yearRoot, partialCaseRel, '_HASARBOTU', 'takip.json');
const partialScan = await scanner.scan(settings);
assert(!(await pathExists(partialTrackingPath)), 'Kısmi senkron şüphesinde scan default takip.json oluşturmuyor', 'takip.json oluşturuldu');
assert(partialScan.report.issues.some((issue) => issue.type === 'partial-sync-missing-tracking'), 'Kısmi senkron eksik takip scan issue üretiyor', JSON.stringify(partialScan.report.issues));

const excelInput = path.join(root, 'iscilik.xlsx');
const excelOutput = path.join(root, 'iscilik-dagitilmis.xlsx');
await fs.writeFile(excelInput, buildMinimalLaborWorkbook([
  { description: 'Kaporta', amount: 0 },
  { description: 'Boya', amount: 0 },
  { description: 'Mekanik', amount: 0 }
]));
const excelPreview = await inspectLaborExcel(excelInput, 33000);
assert(excelPreview.rowCount === 3, 'İşçilik Excel satırları okunuyor', `rowCount=${excelPreview.rowCount}`);
let samePathBlocked = false;
try {
  await distributeLaborExcel(excelInput, 33000, excelInput, { allowEqualDistribution: true });
} catch {
  samePathBlocked = true;
}
assert(samePathBlocked, 'Excel çıktı yolu girdi dosyasıyla aynı seçilirse engelleniyor', 'Aynı input/output path engellenmedi');
const excelResult = await distributeLaborExcel(excelInput, 33000, excelOutput, { allowEqualDistribution: true });
assert(excelResult.distributedTotal === 33000, 'Manuel işçilik tutarı Excel satırlarına dağıtılıyor', `distributedTotal=${excelResult.distributedTotal}`);
assert(excelResult.distributionMode === 'equal', 'Excel boş/0 satırlarda eşit dağıtım modunu bildiriyor', `distributionMode=${excelResult.distributionMode}`);
const excelOutputPreview = await inspectLaborExcel(excelOutput);
assert(excelOutputPreview.existingTotal === 33000, 'Dağıtılmış Excel tekrar okununca toplam korunuyor', `existingTotal=${excelOutputPreview.existingTotal}`);
const excelOutput2 = path.join(root, 'iscilik-dagitilmis-2.xlsx');
const excelResult2 = await distributeLaborExcel(excelOutput, 33000, excelOutput2);
const excelOutputPreview2 = await inspectLaborExcel(excelOutput2);
assert(excelResult2.distributedTotal === 33000 && excelOutputPreview2.existingTotal === 33000, 'Excel ikinci dağıtımda fullCalcOnLoad duplicate bozulması üretmiyor', `distributed=${excelResult2.distributedTotal}, existing=${excelOutputPreview2.existingTotal}`);

const multiMoneyInput = path.join(root, 'portal-coklu-tutar.xlsx');
const multiMoneyOutput = path.join(root, 'portal-coklu-tutar-dagitilmis.xlsx');
await fs.writeFile(multiMoneyInput, buildMultiMoneyLaborWorkbook([
  { description: 'Kaporta', partAmount: 12000, laborAmount: 1000 },
  { description: 'Boya', partAmount: 9000, laborAmount: 2000 },
  { description: 'Mekanik', partAmount: 6000, laborAmount: 3000 }
]));
const multiPreview = await inspectLaborExcel(multiMoneyInput, 12000);
assert(multiPreview.targetColumn === 'C' && /İşçilik|Iscilik|ISCILIK/i.test(multiPreview.targetHeader), 'Excel çoklu para kolonu içinde işçilik başlığı generic tutar üstünde seçiliyor', `column=${multiPreview.targetColumn}, header=${multiPreview.targetHeader}`);
const manualPreview = await inspectLaborExcel(multiMoneyInput, 12000, { targetColumn: 'B' });
assert(manualPreview.targetColumn === 'B' && manualPreview.requiresUserConfirmation === true, 'Excel manuel kolon override riskli/onaylı seçim olarak işaretleniyor', `column=${manualPreview.targetColumn}, requires=${manualPreview.requiresUserConfirmation}`);
let manualBlocked = false;
try { await distributeLaborExcel(multiMoneyInput, 12000, multiMoneyOutput, { targetColumn: 'B' }); } catch { manualBlocked = true; }
assert(manualBlocked, 'Excel manuel/riskli kolon açık onay olmadan dağıtılmıyor', 'Riskli kolon onaysız dağıtıldı');
const multiResult = await distributeLaborExcel(multiMoneyInput, 12000, multiMoneyOutput, { targetColumn: 'C' });
assert(multiResult.verifiedExistingTotal === 12000 && multiResult.targetColumn === 'C', 'Excel çıktı production doğrulaması seçili işçilik kolonunda çalışıyor', JSON.stringify({ total: multiResult.verifiedExistingTotal, column: multiResult.targetColumn }));
const exportRows = index.cases.slice(0, 3).map((item) => ({
  officeFileNo: item.officeFileNo || '', claimNoticeNo: item.claimNoticeNo || '', plate: item.plate,
  claimType: item.claimType, workflowStatus: item.workflowStatus, dosyaDurumu: item.dosyaDurumu,
  sorumlu: item.sorumlu, serviceName: item.serviceName, takipTarihi: item.takipTarihi,
  sonIslemTarihi: item.tracking.assignment.sonIslemTarihi, missingDocuments: item.documentAnalysis.missingCritical.length,
  missingPhotos: 0, unsupportedPhotos: item.photoAnalysis.unsupportedFiles.length,
  openTodos: item.tracking.todos.filter((todo) => !todo.completed).length, folderPath: item.folderPath
}));
const exportResult = await exportCaseListToExcel(exportRows, path.join(root, 'filtreli-dosya-listesi.xlsx'));
assert(exportResult.rowCount === exportRows.length && await pathExists(exportResult.outputPath), 'Filtrelenmiş dosya listesi Excel olarak dışa aktarılıyor', JSON.stringify(exportResult));


async function pathExists(targetPath) {
  try {
    await fs.stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

const failed = checks.filter((item) => !item.ok);
if (failed.length) {
  console.error(`Ofis final denetimi başarısız: ${failed.length} hata.`);
  process.exit(1);
}
console.log(`Ofis final denetimi geçti: ${checks.length} kontrol.`);
