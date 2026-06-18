import fs from 'node:fs';

const detailText = fs.readFileSync('src/renderer/app/components/detail.ts', 'utf-8');
const ipcText = `${fs.readFileSync('src/main/ipc.ts', 'utf-8')}\n${fs.readFileSync('src/main/services/ipc-domain-services.ts', 'utf-8')}`;
const dataFields = [...detailText.matchAll(/data-field="([^"]+)"/g)].map((match) => match[1]);
const uniqueDataFields = [...new Set(dataFields)];
const allowedBlock = ipcText.match(/const allowed = new Set\(\[([\s\S]*?)\]\);/)?.[1] ?? '';
const allowed = [...allowedBlock.matchAll(/'([^']+)'/g)].map((match) => match[1]);
const allowedSet = new Set(allowed);

const missing = uniqueDataFields.filter((field) => !allowedSet.has(field));
if (missing.length) {
  console.error('HATA - UI data-field değerleri IPC allowlist içinde yok:');
  for (const field of missing) console.error(`- ${field}`);
  process.exit(1);
}

console.log(`TAMAM - ${uniqueDataFields.length} UI data-field değeri IPC allowlist ile uyumlu.`);
