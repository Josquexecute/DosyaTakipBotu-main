// Dev Harness Audit v1 — SALT-OKUNUR geliştirme denetimi (runtime'a etkisi yoktur).
// Yalnız dosya okur: hiçbir dosyayı silmez, yazmaz (takip.json/Excel dahil), ağa çıkmaz.
import fs from 'node:fs/promises';

const checks = [];
function ok(name) { checks.push({ name, ok: true }); console.log(`TAMAM - ${name}`); }
function fail(name, message) { checks.push({ name, ok: false, message }); console.error(`HATA - ${name}: ${message}`); }
function assert(condition, name, message) { condition ? ok(name) : fail(name, message); }

async function readIfExists(path) {
  try { return await fs.readFile(path, 'utf-8'); } catch { return null; }
}

// --- AGENTS.md: ana talimat dosyası + zorunlu politika ifadeleri ---
const agents = await readIfExists('AGENTS.md');
assert(agents !== null, 'AGENTS.md mevcut', 'AGENTS.md yok');
const AGENT_PHRASES = [
  'takip.json', 'source of truth', 'preview-first', 'no paid API', 'user approval',
  'Excel', 'Value Loss', 'AI İşçilik', 'final-office-audit', 'npm run test:behavior'
];
for (const phrase of AGENT_PHRASES) {
  assert(agents !== null && agents.includes(phrase), `AGENTS.md anahtar ifade iceriyor: ${phrase}`, `'${phrase}' eksik`);
}
assert(agents !== null && agents.includes('Teslim Raporu Formatı') && agents.includes('Değişen dosyalar') && agents.includes('Sonraki adım'), 'AGENTS.md teslim raporu formatini iceriyor', 'rapor formati eksik');
for (const cmd of ['npm run typecheck', 'npm run build', 'npm run ci', 'npm audit', 'node scripts/final-office-audit.mjs']) {
  assert(agents !== null && agents.includes(cmd), `AGENTS.md zorunlu komutu iceriyor: ${cmd}`, `'${cmd}' eksik`);
}
assert(agents !== null && agents.split(/\r?\n/).length <= 400, 'AGENTS.md 400 satiri gecmiyor', '');

// --- CLAUDE.md: operasyonel talimatlar ---
const claude = await readIfExists('CLAUDE.md');
assert(claude !== null, 'CLAUDE.md mevcut', 'CLAUDE.md yok');
assert(claude !== null && claude.includes('AGENTS.md') && claude.includes('preview-first') && claude.includes('Yasak Eylemler'), 'CLAUDE.md AGENTS referansi + preview-first + yasak listesi iceriyor', '');
assert(claude !== null && claude.includes('TÜRKÇE') && claude.includes('npm run test:behavior'), 'CLAUDE.md Turkce rapor kurali + zorunlu testleri iceriyor', '');

// --- Opsiyonel yonlendirici dosyalar: varsa kisa ve AGENTS.md'ye isaret eder ---
for (const [path, label] of [
  ['CODEX.md', 'CODEX.md'],
  ['.github/copilot-instructions.md', 'copilot-instructions.md'],
  ['.cursor/rules/hasarbotu.mdc', 'cursor hasarbotu.mdc']
]) {
  const text = await readIfExists(path);
  if (text === null) { ok(`${label} yok (opsiyonel, atlandi)`); continue; }
  assert(text.includes('AGENTS.md'), `${label} AGENTS.md'ye isaret ediyor`, 'AGENTS referansi eksik');
  assert(text.split(/\r?\n/).length <= 60, `${label} kisa (<=60 satir)`, `${text.split(/\r?\n/).length} satir`);
}

// --- docs/dev sablonlari: varsa zorunlu bolumleri icerir ---
const taskTpl = await readIfExists('docs/dev/TASK_TEMPLATE.md');
if (taskTpl !== null) {
  assert(['Goal', 'Scope', 'Out of Scope', 'Safety Constraints', 'Files Likely to Change', 'Tests to Run', 'Delivery Report'].every((s) => taskTpl.includes(s)), 'TASK_TEMPLATE.md zorunlu bolumleri iceriyor', 'bolum eksik');
} else ok('TASK_TEMPLATE.md yok (opsiyonel, atlandi)');
const reportTpl = await readIfExists('docs/dev/DELIVERY_REPORT_TEMPLATE.md');
if (reportTpl !== null) {
  assert(['Değişen dosyalar', 'IPC', 'takip.json yazım durumu', 'Excel yazım durumu', 'Web/API durumu', 'Testler', 'Riskler', 'Sonraki adım'].every((s) => reportTpl.includes(s)), 'DELIVERY_REPORT_TEMPLATE.md zorunlu bolumleri iceriyor', 'bolum eksik');
} else ok('DELIVERY_REPORT_TEMPLATE.md yok (opsiyonel, atlandi)');
const secTpl = await readIfExists('docs/dev/SECURITY_CHECKLIST.md');
if (secTpl !== null) {
  assert(['takip.json', 'Excel', 'Web/API', 'Secrets', 'User approval', 'Backup/restore', 'AI preview-first', 'Değer Kaybı', 'Source guards'].every((s) => secTpl.includes(s)), 'SECURITY_CHECKLIST.md zorunlu maddeleri iceriyor', 'madde eksik');
} else ok('SECURITY_CHECKLIST.md yok (opsiyonel, atlandi)');

// --- package.json: dev-harness scripti kayitli ---
const pkg = JSON.parse(await fs.readFile('package.json', 'utf-8'));
assert(pkg.scripts?.['test:dev-harness'] === 'node scripts/dev-harness-audit.mjs', 'package.json test:dev-harness scriptini iceriyor', JSON.stringify(pkg.scripts?.['test:dev-harness']));

const failed = checks.filter((item) => !item.ok);
if (failed.length) {
  console.error(`Dev harness denetimi başarısız: ${failed.length} hata.`);
  process.exit(1);
}
console.log(`Dev harness denetimi geçti: ${checks.length} kontrol.`);
