import fs from 'node:fs';

const preloadBundle = 'dist-electron/preload/preload.js';
const errors = [];

if (!fs.existsSync(preloadBundle)) {
  errors.push(`Preload bundle bulunamadi: ${preloadBundle}`);
} else {
  const text = fs.readFileSync(preloadBundle, 'utf-8');
  const relativeRequires = [...text.matchAll(/require\((['"])(\.\.?[\\/][^'"]+)\1\)/g)].map((match) => match[2]);
  if (relativeRequires.length > 0) {
    errors.push(`Preload bundle icinde relative require kaldi: ${relativeRequires.join(', ')}`);
  }
  if (!text.includes('require("electron")') && !text.includes("require('electron')")) {
    errors.push('Preload bundle electron require izini icermiyor.');
  }
  if (!text.includes('contextBridge.exposeInMainWorld')) {
    errors.push('Preload bundle contextBridge expose akisini icermiyor.');
  }
  if (!text.includes('hasarbotu')) {
    errors.push('Preload bundle window.hasarbotu sozlesmesini icermiyor.');
  }
}

if (errors.length) {
  console.error('Preload bundle audit basarisiz:');
  for (const error of errors) console.error('-', error);
  process.exit(1);
}

console.log('Preload bundle audit gecti. Runtime relative require yok; guvenli kopru bundle icinde.');
