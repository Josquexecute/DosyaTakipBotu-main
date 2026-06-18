import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = process.cwd();
const targetHtml = path.join(root, 'dist-ui', 'renderer', 'index.html');
const outputDir = path.join(root, 'layout-audit');
const screenshotsDir = path.join(outputDir, 'screenshots');
const resultPath = path.join(outputDir, 'results.json');

const viewports = [
  [1280, 720],
  [1366, 768],
  [1440, 900],
  [1536, 864],
  [1600, 900],
  [1920, 1080],
  [2560, 1440]
];
const scales = [1, 1.1, 1.25, 1.5];
const matrix = viewports.flatMap(([width, height]) => scales.map((scale) => ({ width, height, scale })));

await fs.access(targetHtml).catch(() => {
  throw new Error('dist-ui/renderer/index.html bulunamadı. Önce npm run build çalıştırın.');
});
await fs.rm(outputDir, { recursive: true, force: true });
await fs.mkdir(screenshotsDir, { recursive: true });

const electronPath = require('electron');
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hasarbotu-ui-layout-'));
const preloadPath = path.join(tempDir, 'preload.cjs');
const runnerPath = path.join(tempDir, 'runner.cjs');

await fs.writeFile(preloadPath, preloadSource(), 'utf-8');
await fs.writeFile(runnerPath, runnerSource(), 'utf-8');
await fs.writeFile(path.join(tempDir, 'package.json'), JSON.stringify({ name: 'hasarbotu-ui-layout-audit', main: 'runner.cjs' }), 'utf-8');

const child = spawn(electronPath, [tempDir], {
  cwd: root,
  env: {
    ...process.env,
    HASARBOTU_LAYOUT_TARGET: targetHtml,
    HASARBOTU_LAYOUT_PRELOAD: preloadPath,
    HASARBOTU_LAYOUT_RESULT: resultPath,
    HASARBOTU_LAYOUT_SCREENSHOTS: screenshotsDir,
    HASARBOTU_LAYOUT_MATRIX: JSON.stringify(matrix)
  },
  stdio: ['ignore', 'pipe', 'pipe']
});

let stdout = '';
let stderr = '';
child.stdout.on('data', (chunk) => {
  const text = chunk.toString();
  stdout += text;
  process.stdout.write(text);
});
child.stderr.on('data', (chunk) => {
  const text = chunk.toString();
  stderr += text;
  process.stderr.write(text);
});

const exitCode = await new Promise((resolve) => child.on('close', resolve));
if (exitCode !== 0) throw new Error(`Electron layout denetimi çalışmadı. Çıkış kodu=${exitCode}`);

const results = JSON.parse(await fs.readFile(resultPath, 'utf-8'));
let failed = 0;
console.log('Çözünürlük/ölçek layout matrisi:');
for (const combo of results.combos) {
  const status = combo.pass ? 'PASS' : 'FAIL';
  if (!combo.pass) failed += 1;
  console.log(`${status} ${combo.width}x${combo.height} @ ${Math.round(combo.scale * 100)}% | yatay taşma: ${combo.horizontalOverflow ? 'evet' : 'hayır'} | çakışan kontrol: ${combo.overlapCount} | gizli kritik aksiyon: ${combo.hiddenCriticalCount} | sidebar: ${combo.sidebarBehavior} | panel scroll: ${combo.panelScrollBehavior} | ekran: ${combo.worstScreen}`);
}
console.log(`Ekran görüntüleri: ${screenshotsDir}`);
const iaFailures = results.iaFailures || [];
if (iaFailures.length) {
  console.error('Bilgi mimarisi kabul kontrolleri BAŞARISIZ:');
  for (const failure of iaFailures) console.error(' -', failure);
} else {
  console.log('Bilgi mimarisi kabul kontrolleri geçti: Ana Sayfa odak listesi/uyarı bloğu yok, Dosyalar tam liste (10 kolon + seçim), Klasörler folder:list IPC ile render edildi.');
}
if (failed || iaFailures.length) {
  if (failed) console.error(`Layout denetimi başarısız: ${failed} kombinasyon sorunlu.`);
  process.exit(1);
}
console.log('Layout denetimi geçti.');

function preloadSource() {
  return String.raw`
const { contextBridge } = require('electron');

const now = new Date().toISOString();

function tracking(caseId, plate, overrides = {}) {
  return {
    schemaVersion: 1,
    caseIdentity: {
      caseKey: caseId,
      plate,
      dosyaNo: caseId,
      officeFileNo: overrides.officeFileNo || caseId,
      claimNoticeNo: overrides.claimNoticeNo || '13-17947703',
      folderPath: 'P:\\BARAN GLOBAL EKSPERTİZ\\2026\\06 HAZİRAN\\' + caseId + ' ' + plate,
      monthFolder: '06 HAZİRAN',
      isClosedFolder: overrides.closed === true
    },
    metadata: { createdAt: now, updatedAt: now, createdByComputer: 'TEST-PC', updatedByComputer: 'TEST-PC', revision: overrides.revision || 4, writeId: 'layout-' + caseId },
    assignment: { sorumlu: overrides.sorumlu || 'Mehmet K.', eksper: 'Ahmet Yılmaz', raportor: 'Ömer Faruk İşleyen', takipTarihi: overrides.takipTarihi || '2026-06-15', sonIslemTarihi: '2026-06-13', oncelik: overrides.oncelik || 'Normal' },
    status: { dosyaDurumu: overrides.dosyaDurumu || 'İncelemede', workflowStatus: overrides.workflowStatus || 'Evrak Bekleniyor', kapaliMi: overrides.closed === true },
    claimType: overrides.claimType || 'trafik',
    service: { name: overrides.serviceName || 'İstanbul Servis', source: 'manual', updatedAt: now, updatedBy: 'Ömer Faruk İşleyen' },
    portalChecklist: [
      { key: 'foy', label: 'İhbar föyü yüklendi', completed: true, completedAt: now, completedBy: 'Mehmet K.' },
      { key: 'evrak', label: 'Eksik evrak kontrol edildi', completed: overrides.clean === true },
      { key: 'rapor', label: 'Rapor portal kontrolü', completed: false }
    ],
    todos: overrides.clean ? [] : [
      { id: 'todo-1', title: 'Ruhsat evrağı tekrar istendi', completed: false, priority: 'Yüksek', assignedTo: overrides.sorumlu || 'Mehmet K.', dueDate: '2026-06-14', createdAt: now },
      { id: 'todo-2', title: 'Portal yükleme kontrolü', completed: false, priority: 'Normal', assignedTo: 'Ayşe D.', dueDate: '2026-06-17', createdAt: now }
    ],
    notes: [
      { id: 'note-1', createdAt: now, createdBy: 'Ömer Faruk İşleyen', text: 'Evrak talebi sigortalıya iletildi.' }
    ],
    service: { name: overrides.serviceName || 'İstanbul Servis', source: 'manual', updatedAt: now, updatedBy: 'Ömer Faruk İşleyen' },
    rucu: { varMi: false, potansiyel: overrides.rucu === true, durum: overrides.rucu ? 'İncelenecek' : '', not: '' },
    labor: { parcaListesiIstendi: true, parcaKodlariIstendi: false, parcaIscilikGirildi: false, not: '' },
    kttKusur: { helperOnly: true, finalDecisionWarning: 'Kusur oranı nihai karar değildir; kullanıcı doğrulamalı.', not: '' },
    heavyDamage: { helperOnly: true, finalDecisionWarning: 'Ağır hasar kararı kullanıcı onayı gerektirir.', not: '', enabled: false },
    audit: []
  };
}

function makeCase(caseId, plate, overrides = {}) {
  const t = tracking(caseId, plate, overrides);
  const folderPath = t.caseIdentity.folderPath;
  const missingCritical = overrides.clean ? [] : ['Ruhsat', 'Ehliyet'];
  const unsupportedFiles = overrides.unsupported ? ['IMG_004.HEIC'] : [];
  const photoWarnings = overrides.clean ? [] : ['Minimum fotoğraf adedi kontrol edilmeli'];
  return {
    id: caseId,
    plate,
    dosyaNo: caseId,
    officeFileNo: overrides.officeFileNo || caseId,
    claimNoticeNo: overrides.claimNoticeNo || '13-17947703',
    monthFolder: '06 HAZİRAN',
    folderPath,
    isClosedFolder: overrides.closed === true,
    claimType: overrides.claimType || 'trafik',
    workflowStatus: overrides.workflowStatus || 'Evrak Bekleniyor',
    dosyaDurumu: overrides.dosyaDurumu || 'İncelemede',
    oncelik: overrides.oncelik || 'Normal',
    sorumlu: overrides.sorumlu || 'Mehmet K.',
    serviceName: overrides.serviceName || 'İstanbul Servis',
    eksper: 'Ahmet Yılmaz',
    raportor: 'Ömer Faruk İşleyen',
    takipTarihi: overrides.takipTarihi || '2026-06-15',
    revision: t.metadata.revision,
    updatedAt: overrides.updatedAt || now,
    documentAnalysis: {
      claimType: overrides.claimType || 'trafik',
      evrakFolderExists: true,
      filesScanned: 18,
      requirements: [
        { key: 'ktt', label: 'Kaza Tespit Tutanağı', found: true, matchedFiles: ['KTT.pdf'] },
        { key: 'ruhsat', label: 'Ruhsat', found: overrides.clean === true, matchedFiles: overrides.clean ? ['Ruhsat.pdf'] : [], warning: 'Bulunamadı' },
        { key: 'ehliyet', label: 'Ehliyet', found: overrides.clean === true, matchedFiles: overrides.clean ? ['Ehliyet.pdf'] : [], warning: 'Bulunamadı' }
      ],
      missingCritical,
      claimNoticeNo: overrides.claimNoticeNo || '13-17947703',
      claimNoticeFiles: ['İhbar Föyü.pdf'],
      hasKttOrZabitOrBeyan: true,
      counterpartyPolicyCandidate: overrides.rucu === true,
      conflictFiles: overrides.conflict ? ['takip (Çakışan kopya).json'] : [],
      warnings: overrides.conflict ? ['pCloud çakışma kopyası mevcut'] : []
    },
    photoAnalysis: {
      hasarFolderExists: true,
      totalImageFiles: 12,
      damagePhotoCount: overrides.clean ? 7 : 3,
      hasKm: true,
      hasVites: overrides.clean === true,
      hasSaseOrSasi: false,
      unsupportedFiles,
      corruptSuspects: overrides.corrupt ? ['IMG_0999.JPG'] : [],
      previews: Array.from({ length: 8 }, (_, index) => ({ fileName: 'IMG_' + String(index + 1).padStart(4, '0') + '.JPG', filePath: folderPath + '\\HASAR\\IMG_' + index + '.JPG', kind: 'hasar', supported: true, corrupt: false })),
      warnings: photoWarnings
    },
    folderContents: {
      totalFilesScanned: 42,
      groups: [
        { key: 'EVRAK', exists: true, filesScanned: 18, sampleFiles: ['KTT.pdf', 'Ruhsat.pdf'], warnings: [] },
        { key: 'HASAR', exists: true, filesScanned: 12, sampleFiles: ['IMG_0001.JPG'], warnings: [] },
        { key: 'OLAY YERİ', exists: false, filesScanned: 0, sampleFiles: [], warnings: [] },
        { key: 'ONARIM', exists: true, filesScanned: 6, sampleFiles: ['Fatura.xlsx'], warnings: [] }
      ]
    },
    tracking: t,
    trackingSummary: { noteCount: t.notes.length, todoCount: t.todos.length, openTodoCount: t.todos.filter((todo) => !todo.completed).length, lastNoteText: t.notes[0]?.text || '', lastNoteBy: 'Ömer Faruk İşleyen', lastNoteAt: now },
    fingerprint: { folderPath, mtimeMs: Date.now(), size: 0, childCount: 1, evrakMtimeMs: Date.now(), hasarMtimeMs: Date.now(), trackingMtimeMs: Date.now(), hash: 'layout' + caseId },
    searchText: (caseId + ' ' + plate + ' ' + (overrides.sorumlu || 'Mehmet K.')).toLocaleLowerCase('tr-TR'),
    trackingIssue: overrides.conflict ? { type: 'pcloud-conflict-copy', severity: 'critical', title: 'pCloud çakışma kopyası', message: 'Aynı dosyada çakışma kopyası bulundu.', detectedAt: now, source: 'scanner', action: 'compare' } : undefined,
    caseIssues: overrides.conflict ? [{ type: 'pcloud-conflict-copy', severity: 'critical', title: 'pCloud çakışma kopyası', message: 'Conflict kopyası elle incelenmeli.', detectedAt: now, source: 'scanner', action: 'compare' }] : [],
    statusIsClosed: overrides.closed === true
  };
}

// v0.4.4: Liste-öncelikli kabul kontrolleri için yeterli (>=12) örnek dosya.
const cases = [
  makeCase('2026/10452', '34 ABC 123', { oncelik: 'Yüksek', conflict: true, unsupported: true, serviceName: 'Avrupa Servis', sorumlu: 'Mehmet K.', updatedAt: now }),
  makeCase('2026/10450', '06 XYZ 987', { oncelik: 'Normal', workflowStatus: 'Portal Kontrol', rucu: true, sorumlu: 'Ayşe D.', updatedAt: '2026-06-13T09:30:00.000Z' }),
  makeCase('2026/10448', '35 DEF 456', { clean: true, workflowStatus: 'Kapalı', closed: true, oncelik: 'Düşük', sorumlu: 'Sistem', updatedAt: '2026-06-12T14:30:00.000Z' }),
  makeCase('2026/10445', '07 ANT 07', { oncelik: 'Normal', workflowStatus: 'Ekspertiz Atandı', corrupt: true, sorumlu: 'Mehmet K.', updatedAt: '2026-06-12T09:15:00.000Z' }),
  makeCase('2026/10444', '34 KLM 100', { oncelik: 'Normal', workflowStatus: 'Evrak Bekleniyor', sorumlu: 'Ayşe D.', serviceName: 'Avrupa Servis', updatedAt: '2026-06-11T09:15:00.000Z' }),
  makeCase('2026/10443', '06 NOP 200', { oncelik: 'Yüksek', workflowStatus: 'Portal Kontrol', sorumlu: 'Mehmet K.', updatedAt: '2026-06-11T08:15:00.000Z' }),
  makeCase('2026/10442', '35 QRS 300', { clean: true, workflowStatus: 'Ekspertiz Atandı', oncelik: 'Düşük', sorumlu: 'Ayşe D.', updatedAt: '2026-06-10T14:15:00.000Z' }),
  makeCase('2026/10441', '07 TUV 400', { oncelik: 'Normal', workflowStatus: 'Evrak Bekleniyor', sorumlu: 'Sistem', updatedAt: '2026-06-10T09:15:00.000Z' }),
  makeCase('2026/10440', '34 WXY 500', { oncelik: 'Normal', workflowStatus: 'Portal Kontrol', sorumlu: 'Mehmet K.', serviceName: 'Anadolu Servis', updatedAt: '2026-06-09T09:15:00.000Z' }),
  makeCase('2026/10439', '16 ABZ 600', { oncelik: 'Yüksek', workflowStatus: 'Evrak Bekleniyor', sorumlu: 'Ayşe D.', updatedAt: '2026-06-09T08:15:00.000Z' }),
  makeCase('2026/10438', '01 CDE 700', { clean: true, workflowStatus: 'Ekspertiz Atandı', oncelik: 'Normal', sorumlu: 'Mehmet K.', updatedAt: '2026-06-08T14:15:00.000Z' }),
  makeCase('2026/10437', '42 FGH 800', { oncelik: 'Düşük', workflowStatus: 'Portal Kontrol', sorumlu: 'Sistem', serviceName: 'Anadolu Servis', updatedAt: '2026-06-08T09:15:00.000Z' }),
  makeCase('2026/10436', '34 IJK 900', { oncelik: 'Normal', workflowStatus: 'Evrak Bekleniyor', sorumlu: 'Ayşe D.', updatedAt: '2026-06-07T09:15:00.000Z' }),
  makeCase('2026/10435', '06 LMN 010', { oncelik: 'Yüksek', workflowStatus: 'Portal Kontrol', sorumlu: 'Mehmet K.', updatedAt: '2026-06-07T08:15:00.000Z' })
];

const settings = {
  rootPath: 'P:\\BARAN GLOBAL EKSPERTİZ\\2026',
  rootPathConfirmed: true,
  theme: 'light',
  zoom: 1,
  activeUser: 'Ömer Faruk İşleyen',
  activeComputer: 'TEST-PC',
  users: ['Ömer Faruk İşleyen', 'Mehmet K.', 'Ayşe D.'],
  scanIntervals: { fullYearLightMs: 600000 }
};

const dashboard = {
  totalCases: cases.length,
  openCases: 3,
  closedCases: 1,
  missingDocuments: 2,
  missingPhotos: 2,
  unsupportedPhotos: 1,
  portalPending: 2,
  overdueFollowUps: 1,
  rucuPotential: 1,
  heavyDamageEnabled: 0,
  openTasks: 4,
  overdueTasks: 1,
  todayTasks: 2,
  weekTasks: 4,
  conflicts: 1,
  lastScanAt: now,
  rootAvailable: true
};

// v0.4.4: Bandın kompakt/tek/kapatılabilir ve hata satırıyla çoğaltılmadığını test edebilmek için
// güncel-olmayan ama "hedef sürüm" uyarısı taşıyan bir durum kullanılır.
const deployment = {
  activeComputer: 'TEST-PC',
  appVersion: '0.4.10',
  expectedVersion: '0.4.10',
  isOutdated: false,
  versionCheckAvailable: false,
  warnings: ['Ofis hedef sürüm dosyası bulunamadı. Sürüm kontrolü için bu PC kaydedilmeli.'],
  checkedAt: now,
  canWriteClientStatus: true,
  clients: [{ computer: 'TEST-PC', appVersion: '0.4.10', user: 'Ömer Faruk İşleyen', recordedAt: now }]
};

function folderBrowseMock(folderPath) {
  const root = settings.rootPath;
  const target = folderPath || root;
  if (target === root) {
    return {
      rootPath: root, currentPath: root, parentPath: null, atRoot: true, rootAvailable: true, targetIsCase: false,
      nodes: [
        { name: '06 HAZİRAN', path: root + '\\06 HAZİRAN', kind: 'month', exists: true, navigable: true, selectable: false },
        { name: 'KAPALI HAZİRAN 2026', path: root + '\\KAPALI HAZİRAN 2026', kind: 'folder', exists: true, navigable: true, selectable: false }
      ]
    };
  }
  return {
    rootPath: root, currentPath: target, parentPath: root, atRoot: false, rootAvailable: true, targetIsCase: true,
    tracking: { exists: true, revision: 4, updatedAt: now, updatedByComputer: 'TEST-PC' },
    nodes: [
      { name: 'EVRAK', path: target + '\\EVRAK', kind: 'group', groupKey: 'EVRAK', required: true, exists: true, navigable: false, selectable: false },
      { name: 'HASAR', path: target + '\\HASAR', kind: 'group', groupKey: 'HASAR', required: true, exists: true, navigable: false, selectable: false },
      { name: 'OLAY YERİ', path: target + '\\OLAY YERİ', kind: 'group', groupKey: 'OLAY YERİ', required: true, exists: false, navigable: false, selectable: false },
      { name: 'ONARIM', path: target + '\\ONARIM', kind: 'group', groupKey: 'ONARIM', required: true, exists: true, navigable: false, selectable: false }
    ]
  };
}

const ok = (data) => Promise.resolve({ ok: true, data });
contextBridge.exposeInMainWorld('hasarbotu', {
  getSettings: () => ok(settings),
  saveSettings: (next) => { Object.assign(settings, next); return ok(settings); },
  chooseRoot: () => ok(settings),
  getDashboard: () => ok(dashboard),
  listCases: () => ok(cases),
  getCase: (folderPath) => ok(cases.find((item) => item.folderPath === folderPath) || cases[0]),
  refreshCase: (folderPath) => ok(cases.find((item) => item.folderPath === folderPath) || cases[0]),
  listFolders: (folderPath) => ok(folderBrowseMock(folderPath)),
  scanNow: () => ok({ startedAt: now, finishedAt: now, rootPath: settings.rootPath, rootAvailable: true, totalCases: cases.length, changedCases: 0, reusedCases: cases.length, createdTrackingFiles: 0, issues: [], warnings: [] }),
  cancelScan: () => ok(false),
  getPhotoThumbnail: () => ok({ dataUrl: null, filePath: '', cacheHit: false, reason: 'Layout denetimi' }),
  chooseLaborExcel: () => ok({ filePath: 'C:\\Temp\\hasar.xlsx', fileName: 'hasar.xlsx', sheetName: 'Sayfa1', targetColumn: 'C', targetHeader: 'ISCILIK_TOPLAM', selectedColumn: 'C', rowCount: 3, existingTotal: 12000, detection: 'Otomatik', confidence: 'high', distributionMode: 'equal', requiresUserConfirmation: false, formulasWillBeReplaced: false, formulaCellsFound: 0, availableColumns: [{ column: 'C', header: 'ISCILIK_TOPLAM', reason: 'Başlık eşleşti', existingTotal: 12000 }], warnings: [], rows: [{ rowNumber: 2, description: 'Tampon onarım', oldAmount: 4000, newAmount: 11000 }] }),
  inspectLaborExcel: () => ok(null),
  distributeLaborExcel: () => ok({ outputPath: 'C:\\Temp\\hasar-dagitildi.xlsx', distributedTotal: 33000, verifiedExistingTotal: 33000 }),
  exportCaseListExcel: () => ok({ outputPath: 'C:\\Temp\\dosya-listesi.xlsx', rowCount: cases.length }),
  updateChecklist: () => ok({ tracking: cases[0].tracking }),
  addTodo: () => ok({ tracking: cases[0].tracking }),
  updateTodo: () => ok({ tracking: cases[0].tracking }),
  deleteTodo: () => ok({ tracking: cases[0].tracking }),
  addNote: () => ok({ tracking: cases[0].tracking }),
  updateNote: () => ok({ tracking: cases[0].tracking }),
  deleteNote: () => ok({ tracking: cases[0].tracking }),
  resolveConflict: () => ok({ tracking: cases[0].tracking }),
  inspectConflictCopy: () => ok(null),
  acceptDiskBaseline: () => ok(cases[0]),
  updateField: () => ok({ tracking: cases[0].tracking }),
  openFolder: () => ok(true),
  getHealth: () => ok({ summary: 'Layout denetimi', logs: [] }),
  getDeploymentStatus: () => ok(deployment),
  registerDeploymentClient: () => ok(deployment),
  on: () => () => undefined
});
`;
}

function runnerSource() {
  return String.raw`
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');

const target = process.env.HASARBOTU_LAYOUT_TARGET;
const preload = process.env.HASARBOTU_LAYOUT_PRELOAD;
const resultPath = process.env.HASARBOTU_LAYOUT_RESULT;
const screenshotsDir = process.env.HASARBOTU_LAYOUT_SCREENSHOTS;
const matrix = JSON.parse(process.env.HASARBOTU_LAYOUT_MATRIX || '[]');
const screens = [
  { key: 'home', label: 'Ana Sayfa', marker: '.category-grid' },
  { key: 'dosyalar', label: 'Dosyalar (Tam Liste)', marker: '.case-workbench' },
  { key: 'klasorler', label: 'Klasörler', marker: '.folder-tree' },
  { key: 'evrak', label: 'Evrak & Fotoğraf', marker: '.focus-content' },
  { key: 'issues', label: 'Sorunlar / Risk', marker: '.focus-content' },
  { key: 'labor', label: 'Excel Araçları', marker: '.focus-content' },
  { key: 'settings', label: 'Ayarlar / Sistem Sağlığı', marker: '.settings-page' }
];

app.commandLine.appendSwitch('disable-gpu');
run().catch(async (error) => {
  await fs.writeFile(resultPath, JSON.stringify({ error: String(error?.stack || error) }, null, 2), 'utf-8').catch(() => {});
  console.error(error);
  app.exit(1);
});

async function run() {
  await fs.writeFile(resultPath, JSON.stringify({ stage: 'starting' }, null, 2), 'utf-8');
  await app.whenReady();
  await fs.writeFile(resultPath, JSON.stringify({ stage: 'app-ready' }, null, 2), 'utf-8');
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      preload
    }
  });
  win.webContents.on('console-message', (_event, _level, message) => console.log('renderer:', message));
  win.webContents.on('render-process-gone', (_event, details) => console.error('render-process-gone', JSON.stringify(details)));
  await win.loadFile(target);
  await fs.writeFile(resultPath, JSON.stringify({ stage: 'file-loaded' }, null, 2), 'utf-8');
  await waitForReady(win);

  const combos = [];
  for (const combo of matrix) {
    console.log('layout-check ' + combo.width + 'x' + combo.height + ' @ ' + Math.round(combo.scale * 100) + '%');
    win.setSize(combo.width, combo.height, false);
    win.webContents.setZoomFactor(combo.scale);
    await sleep(80);
    const screenResults = [];
    for (const screen of screens) {
      await activateScreen(win, screen);
      await sleep(45);
      const metrics = await win.webContents.executeJavaScript('(' + measureLayout.toString() + ')()');
      screenResults.push({ ...metrics, label: screen.label });
    }
    const worst = screenResults.find((item) => item.horizontalOverflow || item.overlapCount > 0 || item.hiddenCriticalCount > 0) || screenResults[0];
    const pass = screenResults.every((item) => !item.horizontalOverflow && item.overlapCount === 0 && item.hiddenCriticalCount === 0);
    let screenshotPath = '';
    if (!pass || shouldCapture(combo)) {
      if (shouldCapture(combo)) {
        await win.loadFile(target);
        await waitForReady(win);
        await sleep(180);
        win.setSize(combo.width, combo.height, false);
        win.webContents.setZoomFactor(combo.scale);
        await sleep(80);
        await activateScreen(win, { key: 'dosyalar', marker: '.case-workbench' });
        await sleep(80);
      }
      const shotName = combo.width + 'x' + combo.height + '-' + Math.round(combo.scale * 100) + '.png';
      screenshotPath = path.join(screenshotsDir, shotName);
      const image = await win.capturePage();
      await fs.writeFile(screenshotPath, image.toPNG());
    }
    combos.push({
      ...combo,
      pass,
      horizontalOverflow: screenResults.some((item) => item.horizontalOverflow),
      overlapCount: screenResults.reduce((max, item) => Math.max(max, item.overlapCount), 0),
      hiddenCriticalCount: screenResults.reduce((max, item) => Math.max(max, item.hiddenCriticalCount), 0),
      sidebarBehavior: worst?.sidebarBehavior || 'bilinmiyor',
      panelScrollBehavior: worst?.panelScrollBehavior || 'bilinmiyor',
      worstScreen: worst?.label || 'bilinmiyor',
      screenshot: screenshotPath,
      screens: screenResults
    });
    await fs.writeFile(resultPath, JSON.stringify({ combos }, null, 2), 'utf-8');
  }

  const iaFailures = await verifyIa(win).catch((error) => ['Bilgi mimarisi doğrulaması hata verdi: ' + String((error && error.stack) || error)]);
  await fs.writeFile(resultPath, JSON.stringify({ combos, iaFailures }, null, 2), 'utf-8');
  win.destroy();
  app.exit(0);
}

async function waitForReady(win) {
  for (let i = 0; i < 100; i += 1) {
    const ready = await win.webContents.executeJavaScript("Boolean(document.querySelector('.main-area'))").catch(() => false);
    if (ready) return;
    await sleep(100);
  }
  throw new Error('Renderer hazır olmadı.');
}

async function clickNav(win, key) {
  return win.webContents.executeJavaScript("(() => { const tab = document.querySelector('.nav-item[data-tab=\"" + key + "\"]'); if (tab) tab.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window })); })()");
}

async function waitForSelector(win, selector, tries) {
  for (let i = 0; i < tries; i += 1) {
    const ready = await win.webContents.executeJavaScript("Boolean(document.querySelector('" + selector + "'))").catch(() => false);
    if (ready) return true;
    await sleep(40);
  }
  return false;
}

async function activateScreen(win, screen) {
  // v0.4.1: Odak sayfaları seçili dosya ister. Önce Dosyalar'a geçip ilk satırı seç, sonra hedef sayfaya git.
  await clickNav(win, 'dosyalar');
  await sleep(50);
  await win.webContents.executeJavaScript("(() => { const first = document.querySelector('[data-folder]'); if (first) first.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window })); })()");
  await sleep(50);
  await clickNav(win, screen.key);
  await waitForSelector(win, screen.marker || '.workspace-page', 40);
}

async function verifyIa(win) {
  const failures = [];
  win.setSize(1440, 900, false);
  win.webContents.setZoomFactor(1);
  await sleep(80);

  // Ana Sayfa: kompakt kategori paneli; yasaklı bloklar yok.
  await clickNav(win, 'home');
  await waitForSelector(win, '.category-grid', 60);
  const home = await win.webContents.executeJavaScript("(() => { const root = document.querySelector('.home-page') || document.body; return { text: (root.innerText || ''), cards: document.querySelectorAll('.category-card').length, hasDosyalar: !!document.querySelector('.category-card[data-tab=\"dosyalar\"]'), hasKlasorler: !!document.querySelector('.category-card[data-tab=\"klasorler\"]') }; })()");
  if (home.text.indexOf('Önce Bakılacak Dosyalar') !== -1) failures.push('Ana Sayfa hâlâ "Önce Bakılacak Dosyalar" gösteriyor.');
  if (home.text.indexOf('dikkat istiyor') !== -1) failures.push('Ana Sayfa hâlâ "Bugün X konu dikkat istiyor" gösteriyor.');
  if (home.cards < 11) failures.push('Ana Sayfa kategori kartı sayısı 11 altında: ' + home.cards);
  if (!home.hasDosyalar || !home.hasKlasorler) failures.push('Ana Sayfa kartlarında Dosyalar/Klasörler kategorisi yok.');

  // v0.4.4: Ofis sürüm bandı kompakt, tek, kapatılabilir ve hata satırında çoğaltılmamış olmalı.
  const banner = await win.webContents.executeJavaScript("(() => { const b = document.querySelectorAll('.deployment-banner'); const first = b[0]; const rect = first ? first.getBoundingClientRect() : null; const errs = Array.from(document.querySelectorAll('.app-alert.error')).map((e) => e.textContent || ''); return { count: b.length, height: rect ? Math.round(rect.height) : 0, hasDismiss: !!document.querySelector('.deployment-banner [data-action=\"dismiss-deployment-banner\"]'), dupInError: errs.some((e) => e.indexOf('hedef sürüm') !== -1) }; })()");
  if (banner.count !== 1) failures.push('Ofis sürüm bandı tek değil (adet ' + banner.count + ').');
  if (banner.count === 1 && banner.height > 56) failures.push('Ofis sürüm bandı kompakt değil (yükseklik ' + banner.height + 'px).');
  if (banner.count === 1 && !banner.hasDismiss) failures.push('Ofis sürüm bandında kapatma düğmesi yok.');
  if (banner.dupInError) failures.push('Ofis sürüm uyarısı hem bantta hem hata satırında çoğaltılmış.');
  await win.webContents.executeJavaScript("(() => { const x = document.querySelector('.deployment-banner [data-action=\"dismiss-deployment-banner\"]'); if (x) x.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window })); })()");
  await sleep(90);
  const bannerGone = await win.webContents.executeJavaScript("document.querySelectorAll('.deployment-banner').length");
  if (bannerGone !== 0) failures.push('Ofis sürüm bandı kapatıldıktan sonra hâlâ görünüyor.');

  // Dosyalar: tam liste + 10 kolon + satır seçince panel güncellenir.
  await clickNav(win, 'dosyalar');
  await waitForSelector(win, '.case-workbench', 60);
  const dosyalar = await win.webContents.executeJavaScript("(() => { const headers = Array.from(document.querySelectorAll('.case-table thead th')).map((th) => th.textContent.trim()); return { rows: document.querySelectorAll('.case-row').length, headers }; })()");
  if (dosyalar.rows < 1) failures.push('Dosyalar tam liste satır göstermiyor.');
  ['Plaka', 'Dosya No', 'İhbar No', 'Ay / Klasör', 'Durum', 'Sorumlu', 'Öncelik', 'Eksik', 'Son İşlem', 'Takip Tarihi'].forEach((col) => {
    if (dosyalar.headers.indexOf(col) === -1) failures.push('Dosyalar kolonu eksik: ' + col);
  });
  await win.webContents.executeJavaScript("(() => { const row = document.querySelector('.case-row'); if (row) row.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window })); })()");
  await sleep(150);
  const selected = await win.webContents.executeJavaScript("(() => ({ sel: document.querySelectorAll('.case-row.selected').length, summary: !!document.querySelector('.case-summary-card .summary-plate') }))()");
  if (selected.sel < 1) failures.push('Dosya satırı seçilince .selected işaretlenmiyor.');
  if (!selected.summary) failures.push('Dosya seçilince seçili dosya paneli güncellenmiyor.');

  // v0.4.4: Gelişmiş Filtreler varsayılan kapalı; düğmeyle açılır.
  const advBefore = await win.webContents.executeJavaScript("(() => { const a = document.querySelector('.advanced-filters'); const vis = a ? (a.offsetParent !== null && getComputedStyle(a).display !== 'none') : false; return { exists: !!a, visible: vis, toggle: !!document.querySelector('[data-action=\"toggle-advanced-filters\"]') }; })()");
  if (!advBefore.exists) failures.push('Gelişmiş Filtreler bölümü render edilmedi.');
  if (!advBefore.toggle) failures.push('Gelişmiş Filtreler düğmesi yok.');
  if (advBefore.visible) failures.push('Gelişmiş Filtreler varsayılan olarak açık; kapalı olmalı.');
  await win.webContents.executeJavaScript("(() => { const t = document.querySelector('[data-action=\"toggle-advanced-filters\"]'); if (t) t.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window })); })()");
  await sleep(90);
  const advAfter = await win.webContents.executeJavaScript("(() => { const a = document.querySelector('.advanced-filters'); return a ? (a.offsetParent !== null && getComputedStyle(a).display !== 'none') : false; })()");
  if (!advAfter) failures.push('Gelişmiş Filtreler düğmesi açılır bölümü göstermiyor.');
  await win.webContents.executeJavaScript("(() => { const t = document.querySelector('[data-action=\"toggle-advanced-filters\"]'); if (t) t.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window })); })()");
  await sleep(90);

  // v0.4.4: Liste-öncelikli düzen — 1366x768 ve 1920x1080'de >=8 görünür satır, panel dikeyin <=%35'i.
  // Her ölçüm taze sayfa yüklemesiyle yapılır (matris sonrası zoom/scroll durumundan bağımsız olsun).
  for (const [w, h] of [[1366, 768], [1920, 1080]]) {
    win.setSize(w, h, false);
    await sleep(60);
    await win.loadFile(process.env.HASARBOTU_LAYOUT_TARGET);
    await waitForReady(win);
    win.webContents.setZoomFactor(1);
    await sleep(120);
    await clickNav(win, 'dosyalar');
    await waitForSelector(win, '.case-workbench', 60);
    await win.webContents.executeJavaScript("(() => { const row = document.querySelector('.case-row'); if (row) row.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window })); })()");
    await sleep(140);
    // v0.4.4: Açılış taraması toast'ı asenkron geldiği için birkaç kez kapatıp kararlı liste düzenini ölçeriz.
    for (let i = 0; i < 6; i += 1) {
      await win.webContents.executeJavaScript("Array.from(document.querySelectorAll('.alert-dismiss, [data-action=\"dismiss-deployment-banner\"]')).forEach((b) => b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window })))");
      await sleep(180);
    }
    const m = await win.webContents.executeJavaScript("(() => { const tw = document.querySelector('.table-wrap'); const wb = document.querySelector('.case-workbench'); const sc = document.querySelector('.case-summary-card'); const twRect = tw ? tw.getBoundingClientRect() : null; const visibleRows = twRect ? Array.from(document.querySelectorAll('.case-row')).filter((r) => { const rr = r.getBoundingClientRect(); return rr.height > 0 && rr.top >= twRect.top - 1 && rr.bottom <= twRect.bottom + 1; }).length : 0; const wbH = wb ? wb.getBoundingClientRect().height : 0; const scH = sc ? sc.getBoundingClientRect().height : 0; return { visibleRows, ratio: wbH ? scH / wbH : 1 }; })()");
    console.log('Dosyalar ' + w + 'x' + h + ': görünür satır=' + m.visibleRows + ', panel oranı=%' + Math.round(m.ratio * 100));
    if (m.visibleRows < 8) failures.push('Dosyalar ' + w + 'x' + h + ' ekranında 8 görünür satır yok: ' + m.visibleRows);
    if (m.ratio > 0.35) failures.push('Seçili dosya paneli ' + w + 'x' + h + ' ekranında dikey alanın %35 üzerinde: %' + Math.round(m.ratio * 100));
  }
  win.setSize(1440, 900, false);
  await sleep(80);

  // Klasörler: yalnızca folder:list IPC verisinden render edilir.
  await clickNav(win, 'klasorler');
  await waitForSelector(win, '.folder-tree', 80);
  const klas = await win.webContents.executeJavaScript("(() => ({ tree: !!document.querySelector('.folder-tree'), nodes: document.querySelectorAll('.folder-node, .folder-group').length }))()");
  if (!klas.tree) failures.push('Klasörler ağaç görünümü (folder:list IPC) render edilmedi.');

  return failures;
}

function measureLayout() {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const root = document.documentElement;
  const app = document.querySelector('.app-shell') || document.body;
  const horizontalOverflow = Math.max(root.scrollWidth, document.body.scrollWidth, app.scrollWidth) > viewportWidth + 2;
  const visible = (el) => {
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    if (style.display === 'none' || style.visibility === 'hidden' || rect.width <= 0 || rect.height <= 0) return false;
    const centerX = Math.min(window.innerWidth - 1, Math.max(0, rect.left + rect.width / 2));
    const centerY = Math.min(window.innerHeight - 1, Math.max(0, rect.top + rect.height / 2));
    const topElement = document.elementFromPoint(centerX, centerY);
    return Boolean(topElement && (el === topElement || el.contains(topElement) || topElement.contains(el)));
  };
  const containers = ['.top-app-bar', '.side-nav-bar', '.detail-header', '.detail-tabs', '.list-toolbar', '.settings-page', '.summary-actions', '.issue-row', '.excel-steps'];
  let overlapCount = 0;
  const overlapPairs = [];
  for (const selector of containers) {
    for (const container of document.querySelectorAll(selector)) {
      const controls = Array.from(container.querySelectorAll('button, input, select, textarea, [data-action], [data-tab], [data-filter]')).filter(visible);
      for (let i = 0; i < controls.length; i += 1) {
        const a = controls[i].getBoundingClientRect();
        for (let j = i + 1; j < controls.length; j += 1) {
          const b = controls[j].getBoundingClientRect();
          const overlap = a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1;
          if (overlap) {
            overlapCount += 1;
            if (overlapPairs.length < 5) overlapPairs.push({
              container: selector,
              a: controls[i].outerHTML.slice(0, 120),
              b: controls[j].outerHTML.slice(0, 120)
            });
          }
        }
      }
    }
  }
  const criticalSelectors = [
    '[data-action="scan"]',
    '[data-action="scan-cancel"]',
    '[data-action="open-folder"]',
    '[data-action="refresh-case"]',
    '[data-action="export-cases-excel"]',
    '[data-action="choose-root"]',
    '[data-action="save-settings"]'
  ];
  let hiddenCriticalCount = 0;
  for (const selector of criticalSelectors) {
    for (const el of document.querySelectorAll(selector)) {
      if (!visible(el)) continue;
      const rect = el.getBoundingClientRect();
      if (rect.right < -1 || rect.bottom < -1 || rect.left > viewportWidth + 1 || rect.top > viewportHeight + 1) hiddenCriticalCount += 1;
    }
  }
  const sidebar = document.querySelector('.side-nav-bar');
  const sidebarRect = sidebar?.getBoundingClientRect();
  const sidebarBehavior = !sidebar || !visible(sidebar)
    ? 'gizli'
    : sidebarRect.width <= 80
      ? 'daraltılmış'
      : 'tam';
  const scrollables = Array.from(document.querySelectorAll('.master-pane, .detail-content, .settings-workspace, .table-wrap, .virtual-case-list, .detail-tabs'))
    .filter((el) => visible(el) && (el.scrollHeight > el.clientHeight + 2 || el.scrollWidth > el.clientWidth + 2))
    .map((el) => el.className || el.tagName);
  return {
    viewportWidth,
    viewportHeight,
    horizontalOverflow,
    overlapCount,
    overlapPairs,
    hiddenCriticalCount,
    sidebarBehavior,
    panelScrollBehavior: scrollables.length ? 'iç panel scroll aktif' : 'scroll gerekmiyor',
    scrollables
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldCapture(combo) {
  const pct = Math.round(combo.scale * 100);
  return (combo.width === 1366 && combo.height === 768 && [100, 125, 150].includes(pct))
    || (combo.width === 1920 && combo.height === 1080 && pct === 100)
    || (combo.width === 2560 && combo.height === 1440 && pct === 100);
}
`;
}
