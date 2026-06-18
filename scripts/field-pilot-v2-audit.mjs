import fs from 'node:fs';

const checks = [];
function ok(name) { checks.push({ name, ok: true }); console.log(`TAMAM - ${name}`); }
function fail(name, message) { checks.push({ name, ok: false, message }); console.error(`HATA - ${name}: ${message}`); }
function assert(condition, name, message) { condition ? ok(name) : fail(name, message); }
const read = (file) => fs.readFileSync(file, 'utf-8');

const pkg = JSON.parse(read('package.json'));
const dailyWork = read('src/shared/daily-work.ts');
const dataQuality = read('src/shared/data-quality.ts');
const dashboard = read('src/renderer/app/components/dashboard.ts');
const cases = read('src/renderer/app/components/cases.ts');
const pilotPlan = read('docs/PILOT_KABUL_PLANI.md');
const pilotWindows = read('scripts/pilot-windows-check.ps1');
const installWindows = read('scripts/install-windows.ps1');

assert(Boolean(pkg.scripts?.['audit:field-pilot-v2']), 'Saha pilot v2 audit scripti package.json içinde kayıtlı', JSON.stringify(pkg.scripts));
assert(String(pkg.scripts?.ci ?? '').includes('audit:field-pilot-v2'), 'Saha pilot v2 audit CI zincirine bağlı', pkg.scripts?.ci ?? '');
assert(pilotWindows.includes('audit:field-pilot-v2') && installWindows.includes('audit:field-pilot-v2'), 'Saha pilot v2 audit Windows pilot/install akışına bağlı', 'pilot/install bağı eksik');

for (const needle of ['missing-owner', 'missing-followup', 'overdue-followup', 'overdue-todo', 'closed-open-todo', 'close-readiness', 'stale-open-case']) {
  assert(dataQuality.includes(needle), `Veri kalitesi kontrolü mevcut: ${needle}`, 'data-quality izi eksik');
}

for (const needle of ['weekCount', 'unassignedCount', 'staleCount', 'qualityIssueCount', 'qualityCriticalCount']) {
  assert(dailyWork.includes(needle), `Sabah iş akışı v2 sayımı mevcut: ${needle}`, 'daily-work v2 izi eksik');
}

for (const label of ['Bu Hafta', 'Sahipsiz', 'Durgun', 'Veri Kalitesi']) {
  assert(dashboard.includes(label) && cases.includes(label), `Dashboard ve liste v2 filtresini gösterir: ${label}`, 'UI filtre izi eksik');
}

for (const filter of ['week', 'unassigned', 'stale', 'quality']) {
  assert(cases.includes(`case '${filter}'`), `Dosya listesi v2 filtresini uygular: ${filter}`, 'switch izi eksik');
}

for (const needle of ['Saha Pilot v2', 'pilot:copy-month', 'Sahipsiz', 'Durgun', 'Veri Kalitesi', 'pilot:collect']) {
  assert(pilotPlan.includes(needle), `Pilot planı v2 kabul maddesini içerir: ${needle}`, 'pilot plan izi eksik');
}

const failed = checks.filter((item) => !item.ok);
if (failed.length) {
  console.error(`Saha pilot v2 denetimi başarısız: ${failed.length} hata.`);
  process.exit(1);
}
console.log(`Saha pilot v2 denetimi geçti: ${checks.length} kontrol.`);
