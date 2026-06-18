import fs from 'node:fs';

const checks = [
  ['Görev düzenleme IPC', 'src/main/ipc.ts', "tracking:update-todo"],
  ['Görev silme IPC', 'src/main/ipc.ts', "tracking:delete-todo"],
  ['Not düzenleme IPC', 'src/main/ipc.ts', "tracking:update-note"],
  ['Not silme IPC', 'src/main/ipc.ts', "tracking:delete-note"],
  ['Thumbnail IPC', 'src/main/ipc.ts', "photo:get-thumbnail"],
  ['Thumbnail üretimi', 'src/main/local-cache/thumbnail-cache.ts', "nativeImage.createFromPath"],
  ['Bozuk fotoğraf header kontrolü', 'src/main/import/photo-analyzer.ts', "hasValidImageHeader"],
  ['Tarama iptal IPC', 'src/main/ipc.ts', "scan:cancel"],
  ['Scanner abort bağlantısı', 'src/main/services/cases-query-service.ts', "requestAbort"],
  ['Conflict resolver IPC', 'src/main/ipc.ts', "tracking:resolve-conflict"],
  ['Conflict merge servisi', 'src/main/tracking/tracking-file-service.ts', "mergeTrackingFiles"],
  ['Virtualized liste', 'src/renderer/app/components/cases.ts', "virtual-case-list"],
  ['Renderer sanal scroll state', 'src/renderer/main.ts', "caseListScrollTop"],
  ['Renderer thumbnail yükleme', 'src/renderer/main.ts', "loadVisibleThumbnails"],
  ['Conflict ekranı', 'src/renderer/app/components/layout.ts', "Çakışma çözümü gerekli"],
  ['İlk kurulum ana klasör seçimi IPC', 'src/main/ipc.ts', "settings:choose-root"],
  ['Preload ana klasör seçimi', 'src/preload/preload.ts', "chooseRoot"],
  ['Ayarlar ana klasör seç butonu', 'src/renderer/app/components/settings.ts', "Ana Klasör Seç"],
  ['İşçilik Excel seçme IPC', 'src/main/ipc.ts', "labor:choose-excel"],
  ['İşçilik Excel dağıtma IPC', 'src/main/ipc.ts', "labor:distribute-excel"],
  ['İşçilik Excel gerçek dağıtım motoru', 'src/main/import/excel-importer.ts', "distributeLaborExcel"],
  ['İşçilik Excel placeholder kaldırıldı', 'src/main/import/excel-importer.ts', "buildMinimalLaborWorkbook"],
  ['Renderer işçilik Excel ekranı', 'src/renderer/app/components/detail.ts', "Portal Excel İşçilik Dağıtıcı"],
  ['Preload güvenli köprü güncel', 'src/preload/preload.ts', "deleteTodo"],
  ['Renderer tipleri güncel', 'src/renderer/types.d.ts', "getPhotoThumbnail"],
  ['Dosya sorumlusu aktif kullanıcıdan bağımsız varsayılan', 'src/main/tracking/tracking-defaults.ts', "sorumlu: 'Atanmadı'"],
  ['Görev varsayılan sorumlusu dosya sorumlusu', 'src/renderer/main.ts', "fileResponsibleOrActiveUser(item.sorumlu)"],
  ['Sorumlu seçimi ayar listesinde yoksa da görünür', 'src/renderer/app/components/detail.ts', "uniqueOptions(values, selected)"],
  ['Windows ölçekleme auto scale', 'src/renderer/main.ts', "computeResponsiveScale"],
  ['Çözünürlük density CSS', 'src/renderer/styles.css', "density-tight"],
  ['Arama çubuğu odak koruması', 'src/renderer/main.ts', "captureFocusedControl"],
  ['Alt klasör tarama derinliği genişletildi', 'src/main/scanner/case-folder-utils.ts', 'CASE_FILE_RECURSIVE_SCAN_DEPTH = 16'],
  ['Klasör dosya listesi 80 ile sınırlanmıyor', 'src/main/import/case-folder-content-analyzer.ts', '.map((file) => safeFileDisplayName'],
  ['Fotoğraf önizleme listesi 120 ile sınırlanmıyor', 'src/main/import/photo-analyzer.ts', 'previews,'],
  ['Arama indeksi undefined korumalı', 'src/main/scanner/folder-analyzer.ts', 'filter((value): value is string'],
  ['Hotfix 6 bounded concurrency', 'src/main/services/cases-refresh-helpers.ts', 'mapWithConcurrency'],
  ['Hotfix 6 liste payload örnek sınırı', 'src/main/services/case-list-helpers.ts', 'CASE_LIST_SAMPLE_LIMIT'],
  ['Hotfix 6 liste payload fotoğraf sınırı', 'src/main/services/case-list-helpers.ts', 'CASE_LIST_PREVIEW_LIMIT'],
  ['Hotfix 6 search debounce', 'src/renderer/main.ts', 'queueSearchUpdate'],
  ['Hotfix 6 selected case lazy hydrate', 'src/renderer/main.ts', 'hydrateSelectedCase'],
  ['Hotfix 6 audit cap', 'src/main/tracking/tracking-file-service.ts', 'MAX_AUDIT_ITEMS'],
  ['Hotfix 6 log rotation', 'src/main/debug-logger.ts', 'rotateIfNeeded'],
  ['Hotfix 6 dashboard kapalı dosya helper', 'src/main/local-cache/local-cache-store.ts', 'isCaseClosed'],
  ['v0.3.14 APP_VERSION sabiti', 'src/shared/constants.ts', "APP_VERSION = '"],
  ['v0.3.14 deployment IPC status', 'src/main/ipc.ts', 'deployment:get-status'],
  ['v0.3.14 deployment IPC kayıt', 'src/main/ipc.ts', 'deployment:register-client'],
  ['v0.3.14 preload sürüm kontrolü', 'src/preload/preload.ts', 'getDeploymentStatus'],
  ['v0.3.14 görünür sürüm etiketi', 'src/renderer/app/components/layout.ts', 'Sürüm v'],
  ['v0.3.14 ayarlar sürüm kontrol ekranı', 'src/renderer/app/components/settings.ts', 'Sürüm ve Kurulum Kontrolü'],
  ['v0.3.14 ofis sürüm scripti', 'scripts/check-office-versions.ps1', '_HASARBOTU_OFFICE'],
  ['v0.3.14 release hash scripti', 'scripts/release-hash.ps1', 'RELEASE_HASHES_SHA256'],
  ['v0.3.14 release notes scripti', 'scripts/release-notes.ps1', 'RELEASE_NOTES_v'],
  ['v0.3.15 liste payload audit taşımıyor', 'src/main/services/case-list-helpers.ts', 'trackingSummary'],
  ['v0.3.15 liste payload notes/todos limitli', 'src/main/services/case-list-helpers.ts', 'CASE_LIST_OPEN_TODO_LIMIT'],
  ['v0.3.15 tekil case cache', 'src/main/local-cache/local-cache-store.ts', 'writeCaseCache'],
  ['v0.3.15 year index compact', 'src/main/local-cache/local-cache-store.ts', 'compactIndexForDisk'],
  ['v0.3.15 takip fingerprint content hash kaldırıldı', 'src/main/scanner/folder-fingerprint.ts', 'content hash yerine metadata fingerprint'],
  ['v0.3.15 scan çift reload koruması', 'src/renderer/main.ts', 'scanRequestInFlight'],
  ['v0.3.15 thumbnail concurrency', 'src/renderer/main.ts', 'THUMBNAIL_LOAD_CONCURRENCY'],
  ['v0.3.16 actionable dashboard açık dosya helper', 'src/main/local-cache/local-cache-store.ts', 'hasMissingPhotoAction'],
  ['v0.3.16 unsupported fotoğraf KPI ayrımı', 'src/shared/types.ts', 'unsupportedPhotos'],
  ['v0.3.16 KPI kartları filtre uygular', 'src/renderer/app/components/dashboard.ts', 'data-filter'],
  ['v0.3.16 seçili dosya filtre dışı fallback yok', 'src/renderer/app/components/layout.ts', 'selectedCaseVisibleInCurrentList'],
  ['v0.3.16 tek dosya yenile IPC', 'src/main/ipc.ts', "cases:refresh-one"],
  ['v0.3.16 kapalı dosya oturum kilidi', 'src/renderer/main.ts', 'closedMutationUnlocks'],
  ['v0.3.16 toast auto-dismiss', 'src/renderer/main.ts', 'scheduleToastAutoDismiss'],
  ['v0.4.1 Ana Sayfa kategori paneli', 'src/renderer/app/components/home.ts', 'category-grid'],
  ['v0.4.1 sayfa yönlendirici', 'src/renderer/app/components/layout.ts', 'function renderPage'],
  ['v0.4.1 Klasörler yalnızca-okunur IPC kanalı', 'src/main/ipc.ts', 'folder:list'],
  ['v0.4.1 Klasörler IPC handler kayıtlı', 'src/main/ipc.ts', 'IPC.folderList'],
  ['v0.4.1 yalnızca-okunur klasör servisi', 'src/main/services/folders-service.ts', 'class FoldersService'],
  ['v0.4.1 preload klasör listeleme köprüsü', 'src/preload/preload.ts', 'listFolders'],
  ['v0.4.1 Klasörler gezgini bileşeni', 'src/renderer/app/components/folders.ts', 'folder-tree'],
  ['v0.4.1 Klasörler renderer IPC kullanır', 'src/renderer/main.ts', 'window.hasarbotu.listFolders'],
  ['v0.4.1 Dosyalar Ay/Klasör kolonu', 'src/renderer/app/components/cases.ts', 'Ay / Klasör'],
  ['v0.4.1 Dosyalar Takip Tarihi kolonu', 'src/renderer/app/components/cases.ts', 'Takip Tarihi'],
  ['v0.4.1 Dosyalar hızlı filtre şeridi', 'src/renderer/app/components/cases.ts', 'renderQuickFilterStrip'],
  ['v0.4.1 odak sayfası (seçili dosya)', 'src/renderer/app/components/detail.ts', 'renderFocusPage'],
  ['v0.4.1 Sorunlar/Risk sayfası', 'src/renderer/app/components/detail.ts', 'renderIssuesPage']
];

let failed = 0;
for (const [name, file, needle] of checks) {
  const text = sourceWithContract(file);
  if (text.includes(needle)) console.log(`TAMAM - ${name}`);
  else { console.error(`HATA - ${name}: ${file} içinde ${needle} yok`); failed += 1; }
}
if (failed) process.exit(1);

function sourceWithContract(file) {
  const text = fs.readFileSync(file, 'utf8');
  if (file === 'src/main/ipc.ts' || file === 'src/preload/preload.ts' || file === 'src/renderer/types.d.ts') {
    return `${text}\n${fs.readFileSync('src/shared/ipc-contract.ts', 'utf8')}`;
  }
  return text;
}
console.log('Profesyonel özellik denetimi geçti.');
