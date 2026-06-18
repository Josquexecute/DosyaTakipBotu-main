import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { LocalCacheStore } from '../dist-electron/main/local-cache/local-cache-store.js';
import { PcloudYearScanner } from '../dist-electron/main/scanner/pcloud-year-scanner.js';

const require = createRequire(import.meta.url);
const projectRoot = process.cwd();
const args = parseArgs(process.argv.slice(2));
const demoRoot = path.resolve(args.demoRoot ?? 'C:\\HasarBotu-UI-Demo');
const outputDir = path.resolve(args.output ?? path.join(projectRoot, 'ui-demo-screenshots'));
const targetHtml = path.join(projectRoot, 'dist-ui', 'renderer', 'index.html');
const distMarker = path.join(projectRoot, 'dist-electron', 'main', 'scanner', 'pcloud-year-scanner.js');

await fs.access(targetHtml).catch(() => {
  throw new Error('dist-ui/renderer/index.html not found. Run npm run build first.');
});
await fs.access(distMarker).catch(() => {
  throw new Error('dist-electron scanner output not found. Run npm run build first.');
});

const roots = {
  empty: path.join(demoRoot, '2026', '00 BOS'),
  few: path.join(demoRoot, '2026', '05 MAYIS'),
  normal: path.join(demoRoot, '2026', '06 HAZIRAN')
};

for (const root of Object.values(roots)) {
  await fs.access(root).catch(() => {
    throw new Error(`Demo root is missing: ${root}. Run node scripts/create-ui-demo-data.mjs first.`);
  });
}

await fs.rm(outputDir, { recursive: true, force: true });
await fs.mkdir(outputDir, { recursive: true });

const datasets = {
  empty: await scanDataset('empty', roots.empty),
  few: await scanDataset('few', roots.few),
  normal: await scanDataset('normal', roots.normal)
};

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hasarbotu-ui-demo-capture-'));
const dataPath = path.join(tempDir, 'demo-data.json');
const preloadPath = path.join(tempDir, 'preload.cjs');
const runnerPath = path.join(tempDir, 'runner.cjs');
const resultPath = path.join(outputDir, 'ui-demo-results.json');
await fs.writeFile(dataPath, JSON.stringify({ datasets }, null, 2), 'utf-8');
await fs.writeFile(preloadPath, preloadSource(), 'utf-8');
await fs.writeFile(runnerPath, runnerSource(), 'utf-8');
await fs.writeFile(path.join(tempDir, 'package.json'), JSON.stringify({ name: 'hasarbotu-ui-demo-capture', main: 'runner.cjs' }), 'utf-8');

const electronPath = require('electron');
const capturePlan = buildCapturePlan(datasets.normal.selectedCaseFolderPath);
const child = spawn(electronPath, [tempDir], {
  cwd: projectRoot,
  env: {
    ...process.env,
    HASARBOTU_DEMO_TARGET: targetHtml,
    HASARBOTU_DEMO_DATA: dataPath,
    HASARBOTU_DEMO_PRELOAD: preloadPath,
    HASARBOTU_DEMO_OUTPUT: outputDir,
    HASARBOTU_DEMO_RESULT: resultPath,
    HASARBOTU_DEMO_PLAN: JSON.stringify(capturePlan)
  },
  stdio: ['ignore', 'pipe', 'pipe']
});

child.stdout.on('data', (chunk) => process.stdout.write(chunk));
child.stderr.on('data', (chunk) => process.stderr.write(chunk));

const exitCode = await new Promise((resolve) => child.on('close', resolve));
if (exitCode !== 0) throw new Error(`Electron UI demo capture failed with exit code ${exitCode}`);

const results = JSON.parse(await fs.readFile(resultPath, 'utf-8'));
const failures = results.screenshots.filter((item) => !item.pass);
console.log(`Demo root: ${demoRoot}`);
console.log(`Normal fake cases: ${datasets.normal.cases.length}`);
console.log(`Few fake cases: ${datasets.few.cases.length}`);
console.log(`Empty fake cases: ${datasets.empty.cases.length}`);
console.log(`Screenshots: ${outputDir}`);
console.log(`Layout failures: ${failures.length}`);
if (failures.length) process.exitCode = 1;

async function scanDataset(label, rootPath) {
  const appData = path.join(demoRoot, '.capture-appdata', label);
  await fs.rm(appData, { recursive: true, force: true });
  const cache = new LocalCacheStore(appData);
  await cache.ensure();
  const scanner = new PcloudYearScanner(cache);
  const settings = {
    rootPath,
    rootPathConfirmed: true,
    theme: 'light',
    zoom: 1,
    activeUser: 'Demo Raportor',
    activeComputer: 'UI-DEMO-PC',
    users: ['Demo Raportor', 'Demo Mehmet', 'Demo Ayse', 'Demo Enes', 'Demo Berfin'],
    scanIntervals: { fullYearLightMs: 300000 }
  };
  const { index, report } = await scanner.scan(settings);
  const cases = index.cases.map((item) => ({
    ...item,
    trackingSummary: {
      noteCount: item.tracking.notes.length,
      todoCount: item.tracking.todos.length,
      openTodoCount: item.tracking.todos.filter((todo) => !todo.completed).length,
      lastNoteText: item.tracking.notes.at(-1)?.text ?? '',
      lastNoteBy: item.tracking.notes.at(-1)?.createdBy ?? '',
      lastNoteAt: item.tracking.notes.at(-1)?.createdAt ?? ''
    }
  }));
  const dashboard = cache.buildDashboard({ ...index, cases }, true);
  const selected = cases.find((item) => item.plate === '34ABC123' || item.plate === '34 ABC 123')
    ?? cases.find((item) => item.documentAnalysis.conflictFiles.length > 0)
    ?? cases[0]
    ?? null;
  return {
    label,
    rootPath,
    settings,
    dashboard,
    scanReport: report,
    cases,
    selectedCaseFolderPath: selected?.folderPath ?? '',
    selectedPlate: selected?.plate ?? '',
    deploymentStatus: {
      activeComputer: 'UI-DEMO-PC',
      appVersion: '0.4.11',
      expectedVersion: '0.4.11',
      isOutdated: false,
      warnings: [],
      checkedAt: new Date().toISOString(),
      canWriteClientStatus: true,
      rootPath,
      clients: [
        { computer: 'UI-DEMO-PC', appVersion: '0.4.11', user: 'Demo Raportor', rootPath, recordedAt: new Date().toISOString() }
      ]
    }
  };
}

function buildCapturePlan(selectedFolderPath) {
  const sizes = [
    { key: '2k-wide', width: 2560, height: 1440, scale: 1 },
    { key: '1920x1080', width: 1920, height: 1080, scale: 1 },
    { key: '1366x768', width: 1366, height: 768, scale: 1 },
    { key: '1366x768-125', width: 1366, height: 768, scale: 1.25 },
    { key: '1366x768-150', width: 1366, height: 768, scale: 1.5 }
  ];
  const states = [
    { key: '01-dashboard-no-case-selected', dataset: 'normal', setup: ['selectPrimary', 'filterClosed'], description: 'Dashboard with populated data but selected open case filtered out' },
    { key: '02-dashboard-selected-case', dataset: 'normal', setup: ['selectPrimary'], description: 'Dashboard with selected case' },
    { key: '03-case-list-25-50-cases', dataset: 'normal', setup: ['selectPrimary'], description: 'Normal office case list' },
    { key: '04-selected-case-detail', dataset: 'normal', setup: ['selectPrimary', 'tab:ozet'], description: 'Selected case detail summary' },
    { key: '05-operation-tab', dataset: 'normal', setup: ['selectPrimary', 'tab:operasyon'], description: 'Operation tab' },
    { key: '06-documents-photos-tab', dataset: 'normal', setup: ['selectPrimary', 'tab:evrak'], description: 'Documents and photos tab' },
    { key: '07-issues-risk-panel', dataset: 'normal', setup: ['selectPrimary', 'tab:issues'], description: 'Issues/risk panel' },
    { key: '08-excel-tools', dataset: 'normal', setup: ['selectPrimary', 'tab:labor'], description: 'Excel tools' },
    { key: '09-settings-live-screen', dataset: 'normal', setup: ['tab:settings'], description: 'Settings and live/deployment health screen' },
    { key: '10-empty-root-no-data', dataset: 'empty', setup: [], description: 'Empty root no-data state' },
    { key: '11-few-case-state', dataset: 'few', setup: ['selectFirst'], description: 'Few-case pilot state' }
  ];
  return { sizes, states, selectedFolderPath };
}

function preloadSource() {
  return String.raw`
const fs = require('fs');
const { contextBridge } = require('electron');

const payload = JSON.parse(fs.readFileSync(process.env.HASARBOTU_DEMO_DATA, 'utf-8'));
const ok = (data) => Promise.resolve({ ok: true, data });
const fail = (message) => Promise.resolve({ ok: false, error: { code: 'DEMO_ONLY', message } });

function currentDataset() {
  const params = new URLSearchParams(window.location.search || '');
  const key = params.get('dataset') || 'normal';
  return payload.datasets[key] || payload.datasets.normal;
}

function findCase(folderPath) {
  const data = currentDataset();
  return data.cases.find((item) => item.folderPath === folderPath) || data.cases[0] || null;
}

function writeResultFor(folderPath) {
  const item = findCase(folderPath);
  if (!item) return { tracking: null, revision: 1 };
  return { tracking: item.tracking, revision: item.tracking.metadata.revision };
}

contextBridge.exposeInMainWorld('hasarbotu', {
  on: () => () => undefined,
  getSettings: () => ok(currentDataset().settings),
  saveSettings: (settings) => { currentDataset().settings = { ...currentDataset().settings, ...settings }; return ok(currentDataset().settings); },
  chooseRoot: () => ok(currentDataset().settings),
  getDeploymentStatus: () => ok(currentDataset().deploymentStatus),
  registerDeploymentClient: () => ok(currentDataset().deploymentStatus),
  getDashboard: () => ok(currentDataset().dashboard),
  listCases: () => ok(currentDataset().cases),
  getCase: (folderPath) => ok(findCase(folderPath)),
  scanNow: () => ok(currentDataset().scanReport),
  cancelScan: () => ok(true),
  openFolder: () => ok(true),
  refreshCase: (folderPath) => ok(findCase(folderPath)),
  getHealth: () => ok({ appVersion: '0.4.11', electronVersion: process.versions.electron, rootPath: currentDataset().rootPath, cacheRoot: 'UI-DEMO', logsDir: 'UI-DEMO', recentLogs: [] }),
  updateChecklist: (args) => ok(writeResultFor(args.folderPath)),
  updateField: (args) => ok(writeResultFor(args.folderPath)),
  addTodo: (args) => ok(writeResultFor(args.folderPath)),
  updateTodo: (args) => ok(writeResultFor(args.folderPath)),
  deleteTodo: (args) => ok(writeResultFor(args.folderPath)),
  addNote: (args) => ok(writeResultFor(args.folderPath)),
  updateNote: (args) => ok(writeResultFor(args.folderPath)),
  deleteNote: (args) => ok(writeResultFor(args.folderPath)),
  chooseLaborExcel: () => ok(null),
  inspectLaborExcel: () => fail('UI demo does not inspect Excel files.'),
  distributeLaborExcel: () => fail('UI demo does not write Excel files.'),
  exportCaseListExcel: () => ok({ outputPath: 'C:\\\\HasarBotu-UI-Demo\\\\fake-export.xlsx', rowCount: currentDataset().cases.length }),
  inspectConflictCopy: (folderPath) => ok({ folderPath, copies: [] }),
  acceptDiskBaseline: (folderPath) => ok(findCase(folderPath)),
  resolveConflict: (args) => ok(writeResultFor(args.folderPath)),
  getPhotoThumbnail: () => ok({ dataUrl: '' })
});
`;
}

function runnerSource() {
  return String.raw`
const fs = require('fs/promises');
const path = require('path');
const { app, BrowserWindow } = require('electron');

const target = process.env.HASARBOTU_DEMO_TARGET;
const preload = process.env.HASARBOTU_DEMO_PRELOAD;
const outputDir = process.env.HASARBOTU_DEMO_OUTPUT;
const resultPath = process.env.HASARBOTU_DEMO_RESULT;
const plan = JSON.parse(process.env.HASARBOTU_DEMO_PLAN || '{}');

app.commandLine.appendSwitch('disable-gpu');

run().catch(async (error) => {
  await fs.writeFile(resultPath, JSON.stringify({ error: String(error && error.stack || error) }, null, 2), 'utf-8').catch(() => {});
  console.error(error);
  app.exit(1);
});

async function run() {
  await app.whenReady();
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
  const screenshots = [];
  for (const size of plan.sizes) {
    for (const state of plan.states) {
      const result = await captureState(win, size, state);
      screenshots.push(result);
      await fs.writeFile(resultPath, JSON.stringify({ screenshots }, null, 2), 'utf-8');
    }
  }
  await fs.writeFile(resultPath, JSON.stringify({ screenshots }, null, 2), 'utf-8');
  win.destroy();
  app.exit(0);
}

async function captureState(win, size, state) {
  console.log('ui-demo-capture ' + size.key + ' ' + state.key);
  win.setSize(size.width, size.height, false);
  win.webContents.setZoomFactor(size.scale);
  await win.loadFile(target, { query: { dataset: state.dataset } });
  await waitForReady(win);
  win.setSize(size.width, size.height, false);
  win.webContents.setZoomFactor(size.scale);
  await sleep(140);
  for (const step of state.setup || []) {
    await runStep(win, step);
    await sleep(120);
  }
  const metrics = await win.webContents.executeJavaScript('(' + measureLayout.toString() + ')()');
  const fileName = size.key + '--' + state.key + '.png';
  const filePath = path.join(outputDir, fileName);
  const image = await win.capturePage();
  await fs.writeFile(filePath, image.toPNG());
  const pass = !metrics.horizontalOverflow && metrics.overlapCount === 0 && metrics.hiddenCriticalCount === 0;
  return { ...size, state: state.key, dataset: state.dataset, description: state.description, screenshot: filePath, ...metrics, pass };
}

async function runStep(win, step) {
  if (step === 'selectPrimary') {
    await win.webContents.executeJavaScript("(() => { const target = " + JSON.stringify(plan.selectedFolderPath || '') + "; const direct = target && document.querySelector('[data-folder=\"' + CSS.escape(target) + '\"]'); const rows = Array.from(document.querySelectorAll('[data-folder]')); const match = direct || rows.find((row) => /34\\s*ABC\\s*123|34ABC123/.test(row.textContent || '')) || rows[0]; if (match) match.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window })); })()");
    return;
  }
  if (step === 'selectFirst') {
    await win.webContents.executeJavaScript("(() => { const row = document.querySelector('[data-folder]'); if (row) row.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window })); })()");
    return;
  }
  if (step === 'filterClosed') {
    await win.webContents.executeJavaScript("(() => { const filter = document.querySelector('[data-filter=\"closed\"]'); if (filter) filter.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window })); })()");
    return;
  }
  if (step.startsWith('tab:')) {
    const key = step.slice(4);
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await win.webContents.executeJavaScript("(() => { const key = " + JSON.stringify(key) + "; const all = Array.from(document.querySelectorAll('[data-tab=\"' + CSS.escape(key) + '\"]')); const tab = all.find((el) => el.classList.contains('detail-tab')) || all[0]; if (tab) tab.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window })); })()");
      await sleep(90);
      const active = await win.webContents.executeJavaScript("(() => { const key = " + JSON.stringify(key) + "; if (key === 'settings') return Boolean(document.querySelector('.settings-page')); return Boolean(document.querySelector('.detail-tab.active[data-tab=\"' + CSS.escape(key) + '\"]')); })()").catch(() => false);
      if (active) return;
    }
  }
}

async function waitForReady(win) {
  for (let i = 0; i < 120; i += 1) {
    const ready = await win.webContents.executeJavaScript("Boolean(document.querySelector('.main-area'))").catch(() => false);
    if (ready) return;
    await sleep(100);
  }
  throw new Error('Renderer did not become ready.');
}

function measureLayout() {
  const viewportWidth = window.innerWidth;
  const root = document.documentElement;
  const body = document.body;
  const horizontalOverflow = Math.max(root.scrollWidth, body.scrollWidth) > viewportWidth + 2;
  const isVisible = (el) => {
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 1 && rect.height > 1 && rect.bottom > 0 && rect.right > 0 && rect.left < window.innerWidth && rect.top < window.innerHeight;
  };
  const selectors = ['.top-app-bar', '.detail-header', '.detail-tabs', '.list-toolbar', '.summary-actions', '.settings-header-actions', '.issue-row'];
  let overlapCount = 0;
  for (const selector of selectors) {
    for (const container of document.querySelectorAll(selector)) {
      const controls = Array.from(container.querySelectorAll('button, input, select, textarea, [data-action], [data-tab], [data-filter]')).filter(isVisible);
      for (let i = 0; i < controls.length; i += 1) {
        const a = controls[i].getBoundingClientRect();
        for (let j = i + 1; j < controls.length; j += 1) {
          const b = controls[j].getBoundingClientRect();
          const x = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
          const y = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
          if (x * y > 8) overlapCount += 1;
        }
      }
    }
  }
  let hiddenCriticalCount = 0;
  if (!Array.from(document.querySelectorAll('[data-action=\"scan\"]')).some(isVisible)) hiddenCriticalCount += 1;
  if (document.querySelector('.settings-page') && !Array.from(document.querySelectorAll('[data-action=\"save-settings\"]')).some(isVisible)) hiddenCriticalCount += 1;
  if (document.querySelector('.detail-drawer:not(.empty-state)')) {
    if (!Array.from(document.querySelectorAll('[data-action=\"refresh-case\"]')).some(isVisible)) hiddenCriticalCount += 1;
    if (!Array.from(document.querySelectorAll('[data-action=\"open-folder\"]')).some(isVisible)) hiddenCriticalCount += 1;
  }
  return {
    horizontalOverflow,
    overlapCount,
    hiddenCriticalCount,
    viewportWidth,
    viewportHeight: window.innerHeight,
    scrollWidth: Math.max(root.scrollWidth, body.scrollWidth),
    scrollHeight: Math.max(root.scrollHeight, body.scrollHeight)
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
`;
}

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--demo-root') parsed.demoRoot = argv[++i];
    else if (arg === '--output') parsed.output = argv[++i];
  }
  return parsed;
}
