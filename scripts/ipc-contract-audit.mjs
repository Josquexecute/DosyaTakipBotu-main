import fs from 'node:fs';

const errors = [];
const read = (file) => fs.readFileSync(file, 'utf-8');

const contract = read('src/shared/ipc-contract.ts');
const mainIpc = read('src/main/ipc.ts');
const preload = read('src/preload/preload.ts');
const rendererTypes = read('src/renderer/types.d.ts');
const sendSources = [
  read('src/main/main.ts'),
  read('src/main/services/ipc-domain-services.ts'),
  read('src/main/services/cases-query-service.ts')
].join('\n');

const invokeEntries = extractConstEntries(contract, 'IPC_INVOKE_CHANNELS');
const sendEntries = extractConstEntries(contract, 'IPC_SEND_CHANNEL');

if (invokeEntries.length < 25) errors.push(`IPC invoke kanal sayisi beklenenden dusuk: ${invokeEntries.length}`);
if (sendEntries.length < 3) errors.push(`IPC event kanal sayisi beklenenden dusuk: ${sendEntries.length}`);

assertNoDuplicates(invokeEntries, 'invoke');
assertNoDuplicates(sendEntries, 'send');

for (const { key, value } of invokeEntries) {
  if (!mainIpc.includes(`IPC.${key}`)) errors.push(`Main IPC handler kontrat anahtarini kullanmiyor: ${key}`);
  if (!preload.includes(`IPC.${key}`)) errors.push(`Preload API kontrat anahtarini kullanmiyor: ${key}`);
  if (containsRawChannel(mainIpc, value)) errors.push(`src/main/ipc.ts raw invoke kanal stringi iceriyor: ${value}`);
  if (containsRawChannel(preload, value)) errors.push(`src/preload/preload.ts raw invoke kanal stringi iceriyor: ${value}`);
}

for (const { key, value } of sendEntries) {
  if (!sendSources.includes(`IPC_SEND_CHANNEL.${key}`)) errors.push(`Main event gonderimi kontrat anahtarini kullanmiyor: ${key}`);
  if (containsRawChannel(sendSources, value)) errors.push(`Main event raw kanal stringi iceriyor: ${value}`);
}

if (!preload.includes('IPC_SEND_CHANNELS')) errors.push('Preload event izin listesi IPC_SEND_CHANNELS kontratindan beslenmiyor.');
if (!rendererTypes.includes('HasarbotuApi')) errors.push('Renderer window tipi ortak HasarbotuApi kontratini kullanmiyor.');
if ((rendererTypes.match(/interface Window/g) ?? []).length !== 1) errors.push('Renderer window tipi birden fazla yerel interface tanimi iceriyor.');

if (errors.length) {
  console.error('IPC kontrat denetimi basarisiz:');
  for (const error of errors) console.error('-', error);
  process.exit(1);
}

console.log(`TAMAM - IPC kontrat denetimi gecti: ${invokeEntries.length} invoke, ${sendEntries.length} event kanali.`);

function extractConstEntries(source, constName) {
  const match = source.match(new RegExp(`export const ${constName} = \\{([\\s\\S]*?)\\} as const;`));
  if (!match) {
    errors.push(`${constName} kontrati bulunamadi.`);
    return [];
  }
  return [...match[1].matchAll(/^\s*([A-Za-z0-9_]+): '([^']+)'/gm)]
    .map((entry) => ({ key: entry[1], value: entry[2] }));
}

function assertNoDuplicates(entries, label) {
  const keys = new Set();
  const values = new Set();
  for (const { key, value } of entries) {
    if (keys.has(key)) errors.push(`Tekrarlanan ${label} IPC anahtari: ${key}`);
    if (values.has(value)) errors.push(`Tekrarlanan ${label} IPC kanali: ${value}`);
    keys.add(key);
    values.add(value);
  }
}

function containsRawChannel(source, channel) {
  return source.includes(`'${channel}'`) || source.includes(`"${channel}"`);
}
