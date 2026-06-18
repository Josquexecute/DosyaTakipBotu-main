// v0.4.4 Bilgi mimarisi ekran görüntüleri: Ana Sayfa, Dosyalar (tam liste), Dosyalar (seçili),
// Klasörler, Operasyon, Evrak & Fotoğraf, Sorunlar / Risk. Canlı pCloud KULLANILMAZ; mock veri ile çalışır.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = process.cwd();
const targetHtml = path.join(root, 'dist-ui', 'renderer', 'index.html');
const outputDir = path.join(root, 'ia-screenshots');

await fs.access(targetHtml).catch(() => { throw new Error('dist-ui/renderer/index.html yok. Önce npm run build çalıştırın.'); });
await fs.rm(outputDir, { recursive: true, force: true });
await fs.mkdir(outputDir, { recursive: true });

const electronPath = require('electron');
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hasarbotu-ia-shots-'));
const preloadPath = path.join(tempDir, 'preload.cjs');
const runnerPath = path.join(tempDir, 'runner.cjs');
await fs.writeFile(preloadPath, preloadSource(), 'utf-8');
await fs.writeFile(runnerPath, runnerSource(), 'utf-8');
await fs.writeFile(path.join(tempDir, 'package.json'), JSON.stringify({ name: 'hasarbotu-ia-shots', main: 'runner.cjs' }), 'utf-8');

const child = spawn(electronPath, [tempDir], {
  cwd: root,
  env: { ...process.env, IA_TARGET: targetHtml, IA_PRELOAD: preloadPath, IA_OUT: outputDir },
  stdio: ['ignore', 'pipe', 'pipe']
});
child.stdout.on('data', (chunk) => process.stdout.write(chunk));
child.stderr.on('data', (chunk) => process.stderr.write(chunk));
const exitCode = await new Promise((resolve) => child.on('close', resolve));
if (exitCode !== 0) throw new Error('Ekran görüntüsü alımı başarısız. Çıkış kodu=' + exitCode);
console.log('Ekran görüntüleri: ' + outputDir);

function preloadSource() {
  return String.raw`
const { contextBridge } = require('electron');
const now = new Date().toISOString();

function tracking(caseId, plate, overrides = {}) {
  return {
    schemaVersion: 1,
    caseIdentity: { caseKey: caseId, plate, dosyaNo: caseId, officeFileNo: overrides.officeFileNo || caseId, claimNoticeNo: overrides.claimNoticeNo || '13-17947703', folderPath: 'P:\\BARAN GLOBAL EKSPERTİZ\\2026\\06 HAZİRAN\\' + caseId + ' ' + plate, monthFolder: '06 HAZİRAN', isClosedFolder: false },
    metadata: { createdAt: now, updatedAt: now, createdByComputer: 'TEST-PC', updatedByComputer: 'TEST-PC', revision: 4, writeId: 'shot-' + caseId },
    assignment: { sorumlu: overrides.sorumlu || 'Mehmet K.', eksper: 'Ahmet Yılmaz', raportor: 'Ömer Faruk İşleyen', takipTarihi: overrides.takipTarihi || '2026-06-15', sonIslemTarihi: '2026-06-13', oncelik: overrides.oncelik || 'Normal' },
    status: { dosyaDurumu: overrides.dosyaDurumu || 'İncelemede', workflowStatus: overrides.workflowStatus || 'Evrak Bekleniyor', kapaliMi: false },
    claimType: overrides.claimType || 'trafik',
    service: { name: overrides.serviceName || 'İstanbul Servis', source: 'manual', updatedAt: now, updatedBy: 'Ömer Faruk İşleyen' },
    portalChecklist: [
      { key: 'foy', label: 'İhbar föyü yüklendi', completed: true, completedAt: now, completedBy: 'Mehmet K.' },
      { key: 'evrak', label: 'Eksik evrak kontrol edildi', completed: false },
      { key: 'rapor', label: 'Rapor portal kontrolü', completed: false }
    ],
    todos: [
      { id: 'todo-1', title: 'Ruhsat evrağı tekrar istendi', completed: false, priority: 'Yüksek', assignedTo: overrides.sorumlu || 'Mehmet K.', dueDate: '2026-06-14', createdAt: now }
    ],
    notes: [ { id: 'note-1', createdAt: now, createdBy: 'Ömer Faruk İşleyen', text: 'Evrak talebi sigortalıya iletildi.' } ],
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
  return {
    id: caseId, plate, dosyaNo: caseId, officeFileNo: overrides.officeFileNo || caseId, claimNoticeNo: overrides.claimNoticeNo || '13-17947703',
    monthFolder: '06 HAZİRAN', folderPath, isClosedFolder: false, claimType: overrides.claimType || 'trafik',
    workflowStatus: overrides.workflowStatus || 'Evrak Bekleniyor', dosyaDurumu: overrides.dosyaDurumu || 'İncelemede',
    oncelik: overrides.oncelik || 'Normal', sorumlu: overrides.sorumlu || 'Mehmet K.', serviceName: overrides.serviceName || 'İstanbul Servis',
    eksper: 'Ahmet Yılmaz', raportor: 'Ömer Faruk İşleyen', takipTarihi: overrides.takipTarihi || '2026-06-15', revision: 4, updatedAt: overrides.updatedAt || now,
    documentAnalysis: {
      claimType: overrides.claimType || 'trafik', evrakFolderExists: true, filesScanned: 18,
      requirements: [
        { key: 'ktt', label: 'Kaza Tespit Tutanağı', found: true, matchedFiles: ['KTT.pdf'] },
        { key: 'ruhsat', label: 'Ruhsat', found: false, matchedFiles: [], warning: 'Bulunamadı' },
        { key: 'ehliyet', label: 'Ehliyet', found: false, matchedFiles: [], warning: 'Bulunamadı' }
      ],
      missingCritical: overrides.clean ? [] : ['Ruhsat', 'Ehliyet'], claimNoticeNo: overrides.claimNoticeNo || '13-17947703',
      claimNoticeFiles: ['İhbar Föyü.pdf'], hasKttOrZabitOrBeyan: true, counterpartyPolicyCandidate: false, conflictFiles: [], warnings: [], legacyNotes: []
    },
    photoAnalysis: {
      hasarFolderExists: true, totalImageFiles: 12, damagePhotoCount: overrides.clean ? 7 : 3, hasKm: true, hasVites: false, hasSaseOrSasi: false, hasOlayYeri: false,
      unsupportedFiles: overrides.unsupported ? ['IMG_004.HEIC'] : [], corruptSuspects: [],
      previews: Array.from({ length: 6 }, (_, i) => ({ fileName: 'IMG_' + String(i + 1).padStart(4, '0') + '.JPG', filePath: folderPath + '\\HASAR\\IMG_' + i + '.JPG', kind: 'hasar', supported: true, corrupt: false })),
      warnings: overrides.clean ? [] : ['Minimum fotoğraf adedi kontrol edilmeli']
    },
    folderContents: { totalFilesScanned: 42, warnings: [], groups: [
      { key: 'EVRAK', exists: true, filesScanned: 18, sampleFiles: ['KTT.pdf', 'Ruhsat.pdf'], warnings: [] },
      { key: 'HASAR', exists: true, filesScanned: 12, sampleFiles: ['IMG_0001.JPG'], warnings: [] },
      { key: 'OLAY YERİ', exists: false, filesScanned: 0, sampleFiles: [], warnings: [] },
      { key: 'ONARIM', exists: true, filesScanned: 6, sampleFiles: ['Fatura.xlsx'], warnings: [] }
    ] },
    tracking: t,
    trackingSummary: { noteCount: 1, todoCount: 1, openTodoCount: 1, lastNoteText: 'Evrak talebi sigortalıya iletildi.', lastNoteBy: 'Ömer Faruk İşleyen', lastNoteAt: now },
    fingerprint: { folderPath, mtimeMs: Date.now(), size: 0, childCount: 1, evrakMtimeMs: 0, hasarMtimeMs: 0, trackingMtimeMs: 0, hash: 'shot' + caseId },
    searchText: (caseId + ' ' + plate).toLocaleLowerCase('tr-TR'),
    caseIssues: overrides.conflict ? [{ type: 'pcloud-conflict-copy', severity: 'critical', title: 'pCloud çakışma kopyası', message: 'Conflict kopyası elle incelenmeli.', source: 'scanner', action: 'compare' }] : [],
    statusIsClosed: false
  };
}

const cases = [
  makeCase('2026/10452', '34 ABC 123', { oncelik: 'Yüksek', conflict: true, unsupported: true, serviceName: 'Avrupa Servis', sorumlu: 'Mehmet K.' }),
  makeCase('2026/10450', '06 XYZ 987', { oncelik: 'Normal', workflowStatus: 'Portal Kontrol', rucu: true, sorumlu: 'Ayşe D.', updatedAt: '2026-06-13T09:30:00.000Z' }),
  makeCase('2026/10448', '35 DEF 456', { clean: true, oncelik: 'Düşük', sorumlu: 'Sistem', updatedAt: '2026-06-12T14:30:00.000Z' }),
  makeCase('2026/10445', '07 ANT 07', { oncelik: 'Normal', workflowStatus: 'Ekspertiz Atandı', sorumlu: 'Mehmet K.' }),
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

const settings = { rootPath: 'D:\\BARAN_GLOBAL_EKSPERTIZ\\2026', rootPathConfirmed: true, theme: 'light', zoom: 1, activeUser: 'Ömer Faruk İşleyen', activeComputer: 'TEST-PC', users: ['Ömer Faruk İşleyen', 'Mehmet K.', 'Ayşe D.'], scanIntervals: { fullYearLightMs: 600000 } };
const dashboard = { totalCases: cases.length, openCases: 3, closedCases: 1, missingDocuments: 2, missingPhotos: 2, unsupportedPhotos: 1, portalPending: 2, overdueFollowUps: 1, rucuPotential: 1, heavyDamageEnabled: 0, openTasks: 4, overdueTasks: 1, todayTasks: 2, weekTasks: 4, conflicts: 1, lastScanAt: now, rootAvailable: true };
const deployment = { activeComputer: 'TEST-PC', appVersion: '0.4.12', expectedVersion: '0.4.12', isOutdated: false, versionCheckAvailable: false, warnings: ['Ofis hedef sürüm dosyası bulunamadı. Aktif kök yerel klasör olmalıdır.'], checkedAt: now, canWriteClientStatus: true, clients: [{ computer: 'TEST-PC', appVersion: '0.4.12', user: 'Ömer Faruk İşleyen', recordedAt: now }] };

function folderBrowseMock(folderPath) {
  const r = settings.rootPath;
  const target = folderPath || r;
  if (target === r) {
    return { rootPath: r, currentPath: r, parentPath: null, atRoot: true, rootAvailable: true, targetIsCase: false, nodes: [
      { name: '06 HAZİRAN', path: r + '\\06 HAZİRAN', kind: 'month', exists: true, navigable: true, selectable: false },
      { name: '05 MAYIS', path: r + '\\05 MAYIS', kind: 'month', exists: true, navigable: true, selectable: false },
      { name: 'KAPALI HAZİRAN 2026', path: r + '\\KAPALI HAZİRAN 2026', kind: 'folder', exists: true, navigable: true, selectable: false }
    ] };
  }
  if (target.indexOf('06 HAZİRAN') !== -1 && target.indexOf('34 ABC') === -1) {
    return { rootPath: r, currentPath: target, parentPath: r, atRoot: false, rootAvailable: true, targetIsCase: false, nodes: cases.map((c) => ({ name: c.folderPath.split('\\').pop(), path: c.folderPath, kind: 'case', plate: c.plate, exists: true, navigable: true, selectable: true })) };
  }
  return { rootPath: r, currentPath: target, parentPath: r + '\\06 HAZİRAN', atRoot: false, rootAvailable: true, targetIsCase: true,
    tracking: { exists: true, revision: 4, updatedAt: now, updatedByComputer: 'TEST-PC' }, nodes: [
      { name: 'EVRAK', path: target + '\\EVRAK', kind: 'group', groupKey: 'EVRAK', required: true, exists: true, navigable: false, selectable: false },
      { name: 'HASAR', path: target + '\\HASAR', kind: 'group', groupKey: 'HASAR', required: true, exists: true, navigable: false, selectable: false },
      { name: 'OLAY YERİ', path: target + '\\OLAY YERİ', kind: 'group', groupKey: 'OLAY YERİ', required: true, exists: false, navigable: false, selectable: false },
      { name: 'ONARIM', path: target + '\\ONARIM', kind: 'group', groupKey: 'ONARIM', required: true, exists: true, navigable: false, selectable: false }
    ] };
}

const ok = (data) => Promise.resolve({ ok: true, data });
contextBridge.exposeInMainWorld('hasarbotu', {
  getSettings: () => ok(settings), saveSettings: (n) => { Object.assign(settings, n); return ok(settings); }, chooseRoot: () => ok(settings),
  getDashboard: () => ok(dashboard), listCases: () => ok(cases),
  getCase: (fp) => ok(cases.find((c) => c.folderPath === fp) || cases[0]), refreshCase: (fp) => ok(cases.find((c) => c.folderPath === fp) || cases[0]),
  listFolders: (fp) => ok(folderBrowseMock(fp)),
  scanNow: () => ok({ startedAt: now, finishedAt: now, rootPath: settings.rootPath, rootAvailable: true, totalCases: cases.length, changedCases: 0, reusedCases: cases.length, createdTrackingFiles: 0, issues: [], warnings: [] }),
  cancelScan: () => ok(false), getPhotoThumbnail: () => ok({ dataUrl: null, filePath: '', cacheHit: false, reason: 'shot' }),
  chooseLaborExcel: () => ok(null), inspectLaborExcel: () => ok(null), distributeLaborExcel: () => ok({ outputPath: '', distributedTotal: 0, verifiedExistingTotal: 0 }), exportCaseListExcel: () => ok({ outputPath: '', rowCount: cases.length }),
  updateChecklist: () => ok({ tracking: cases[0].tracking }), addTodo: () => ok({ tracking: cases[0].tracking }), updateTodo: () => ok({ tracking: cases[0].tracking }), deleteTodo: () => ok({ tracking: cases[0].tracking }),
  addNote: () => ok({ tracking: cases[0].tracking }), updateNote: () => ok({ tracking: cases[0].tracking }), deleteNote: () => ok({ tracking: cases[0].tracking }),
  resolveConflict: () => ok({ tracking: cases[0].tracking }), inspectConflictCopy: () => ok(null), acceptDiskBaseline: () => ok(cases[0]), updateField: () => ok({ tracking: cases[0].tracking }),
  openFolder: () => ok(true), getHealth: () => ok({ summary: 'shot', logs: [] }), getDeploymentStatus: () => ok(deployment), registerDeploymentClient: () => ok(deployment), on: () => () => undefined
});
`;
}

function runnerSource() {
  return String.raw`
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const target = process.env.IA_TARGET;
const preload = process.env.IA_PRELOAD;
const outDir = process.env.IA_OUT;

app.commandLine.appendSwitch('disable-gpu');
run().catch((e) => { console.error(e); app.exit(1); });

async function run() {
  await app.whenReady();
  const win = new BrowserWindow({ width: 1440, height: 900, show: false, webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: false, preload } });
  win.webContents.on('console-message', (_e, _l, m) => console.log('renderer:', m));
  await win.loadFile(target);
  await waitFor(win, '.main-area', 100);
  await sleep(300);

  await nav(win, 'home'); await waitFor(win, '.category-grid', 60); await sleep(200);
  await capture(win, '12-ofis-surum-banti');
  await dismissAlerts(win); await sleep(150);
  await capture(win, '01-ana-sayfa');

  await nav(win, 'dosyalar'); await waitFor(win, '.case-workbench', 60); await sleep(200); await dismissAlerts(win); await sleep(150);
  await capture(win, '02-dosyalar-tam-liste');
  await capture(win, '03-dosyalar-gelismis-filtreler-kapali');
  await clickRow(win); await sleep(250); await capture(win, '04-dosyalar-secili-dosya');
  await toggleAdvanced(win); await sleep(250); await capture(win, '05-dosyalar-gelismis-filtreler-acik');
  await toggleAdvanced(win); await sleep(150);

  win.setSize(1366, 768, false); await sleep(220); await nav(win, 'dosyalar'); await waitFor(win, '.case-workbench', 60); await sleep(220); await dismissAlerts(win); await sleep(150); await clickRow(win); await sleep(150); await capture(win, '06-dosyalar-1366x768');
  win.setSize(1920, 1080, false); await sleep(220); await nav(win, 'dosyalar'); await waitFor(win, '.case-workbench', 60); await sleep(220); await dismissAlerts(win); await sleep(150); await clickRow(win); await sleep(150); await capture(win, '07-dosyalar-1920x1080');
  win.setSize(1440, 900, false); await sleep(150);

  await nav(win, 'klasorler'); await waitFor(win, '.folder-tree', 80); await sleep(200); await capture(win, '08-klasorler');
  await nav(win, 'operasyon'); await waitFor(win, '.focus-content', 60); await sleep(150); await capture(win, '09-operasyon');
  await nav(win, 'evrak'); await waitFor(win, '.focus-content', 60); await sleep(150); await capture(win, '10-evrak-fotograf');
  await nav(win, 'issues'); await waitFor(win, '.focus-content', 60); await sleep(150); await capture(win, '11-sorunlar-risk');

  win.destroy();
  app.exit(0);
}

async function toggleAdvanced(win) {
  await win.webContents.executeJavaScript("(() => { const t = document.querySelector('[data-action=\"toggle-advanced-filters\"]'); if (t) t.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window })); })()");
}
async function dismissAlerts(win) {
  await win.webContents.executeJavaScript("Array.from(document.querySelectorAll('.alert-dismiss, [data-action=\"dismiss-deployment-banner\"]')).forEach((b) => b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window })))");
}

async function nav(win, key) {
  await win.webContents.executeJavaScript("(() => { const t = document.querySelector('.nav-item[data-tab=\"" + key + "\"]'); if (t) t.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window })); })()");
}
async function clickRow(win) {
  await win.webContents.executeJavaScript("(() => { const r = document.querySelector('.case-row'); if (r) r.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window })); })()");
}
async function capture(win, name) {
  const image = await win.capturePage();
  await fs.writeFile(path.join(outDir, name + '.png'), image.toPNG());
  console.log('Yakalandı: ' + name + '.png');
}
async function waitFor(win, selector, tries) {
  for (let i = 0; i < tries; i += 1) { const r = await win.webContents.executeJavaScript("Boolean(document.querySelector('" + selector + "'))").catch(() => false); if (r) return true; await sleep(40); }
  return false;
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
`;
}
