import fs from 'node:fs/promises';
import { statSync } from 'node:fs';
import path from 'node:path';

const rendererOut = path.join(process.cwd(), 'dist-ui', 'renderer');
await fs.mkdir(rendererOut, { recursive: true });
await fs.copyFile('src/renderer/index.html', path.join(rendererOut, 'index.html'));
await fs.copyFile('src/renderer/styles.css', path.join(rendererOut, 'styles.css'));
await patchEsmImportExtensions(path.join(process.cwd(), 'dist-ui'));
console.log('Arayüz statik dosyaları kopyalandı ve ESM import uzantıları düzeltildi.');

async function patchEsmImportExtensions(root) {
  const files = await collectJsFiles(root);
  for (const file of files) {
    let text = await fs.readFile(file, 'utf-8');
    text = text.replace(/(from\s+['"])(\.\.?\/[^'"]+?)(['"])/g, (_m, prefix, spec, suffix) =>
      `${prefix}${spec}${resolveImportSuffix(file, spec)}${suffix}`);
    text = text.replace(/(import\s*\(\s*['"])(\.\.?\/[^'"]+?)(['"]\s*\))/g, (_m, prefix, spec, suffix) =>
      `${prefix}${spec}${resolveImportSuffix(file, spec)}${suffix}`);
    await fs.writeFile(file, text, 'utf-8');
  }
}

// Relative specifier'a runtime uzantisini ekler. Zaten uzantili ise hic dokunmaz.
// Klasor (barrel) importu ise '/index.js', dosya importu ise '.js' uretir;
// boylece '../shared/knowledge' dogru sekilde '../shared/knowledge/index.js' olur
// ve net::ERR_FILE_NOT_FOUND beyaz ekrani onlenir.
function resolveImportSuffix(importingFile, spec) {
  if (/\.(js|json|css|png|jpg|jpeg|webp|svg)$/.test(spec)) return '';
  const resolved = path.resolve(path.dirname(importingFile), spec);
  if (isDirectoryWithIndex(resolved)) return '/index.js';
  return '.js';
}

function isDirectoryWithIndex(absPath) {
  try {
    if (!statSync(absPath).isDirectory()) return false;
  } catch {
    return false;
  }
  try {
    return statSync(path.join(absPath, 'index.js')).isFile();
  } catch {
    return false;
  }
}

async function collectJsFiles(root) {
  const out = [];
  const entries = await fs.readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) out.push(...await collectJsFiles(full));
    else if (entry.isFile() && entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}
