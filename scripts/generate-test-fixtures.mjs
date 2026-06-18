import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.argv[2] ?? path.join(process.cwd(), '.fixtures', '2026');
const count = Number(process.argv[3] ?? '250');
const months = ['Ocak 2026','Şubat 2026','Mart 2026','Nisan 2026','Mayıs 2026','Haziran 2026'];
await fs.rm(root, { recursive: true, force: true });
for (let i = 0; i < count; i++) {
  const month = months[i % months.length];
  const isClosed = i % 7 === 0;
  const plate = `${String(1 + (i % 81)).padStart(2, '0')}HB${String(i).padStart(4, '0')}`;
  const folderName = i % 19 === 0 ? `${plate} - AĞIR HASARLI` : plate;
  const monthFolder = isClosed ? path.join(root, month, `KAPALI ${month.toLocaleUpperCase('tr-TR')}`) : path.join(root, month);
  const folder = path.join(monthFolder, folderName);
  await fs.mkdir(path.join(folder, 'EVRAK'), { recursive: true });
  await fs.mkdir(path.join(folder, 'HASAR'), { recursive: true });
  await fs.mkdir(path.join(folder, 'OLAY YERİ'), { recursive: true });
  await fs.mkdir(path.join(folder, 'ONARIM'), { recursive: true });
  if (i % 2 === 0) {
    await fs.writeFile(path.join(folder, 'EVRAK', '13-12345678 İHBAR FÖYÜ.pdf'), 'fixture');
    await fs.writeFile(path.join(folder, 'EVRAK', 'K RUHSAT.jpg'), 'fixture');
    await fs.writeFile(path.join(folder, 'EVRAK', 'K EHLİYET.jpg'), 'fixture');
    await fs.writeFile(path.join(folder, 'EVRAK', 'K POLİÇE.jpg'), 'fixture');
    await fs.writeFile(path.join(folder, 'EVRAK', 'KTT.1.jpg'), 'fixture');
  } else {
    await fs.writeFile(path.join(folder, 'EVRAK', '40-12345678 İHBAR FÖYÜ.pdf'), 'fixture');
    await fs.writeFile(path.join(folder, 'EVRAK', 'M RUHSAT.jpeg'), 'fixture');
    await fs.writeFile(path.join(folder, 'EVRAK', 'M EHLİYET.jpg'), 'fixture');
    await fs.writeFile(path.join(folder, 'EVRAK', 'S RUHSAT.jpeg'), 'fixture');
    await fs.writeFile(path.join(folder, 'EVRAK', 'S EHLİYET.jpg'), 'fixture');
    await fs.writeFile(path.join(folder, 'EVRAK', 'ZABIT 1.jpg'), 'fixture');
  }
  await fs.writeFile(path.join(folder, 'HASAR', 'HASAR 101.jpg'), 'fixture');
  await fs.writeFile(path.join(folder, 'HASAR', 'HASAR02.jpeg'), 'fixture');
  await fs.writeFile(path.join(folder, 'HASAR', 'KM.jpg'), 'fixture');
  await fs.writeFile(path.join(folder, 'HASAR', 'VİTES.jpg'), 'fixture');
  await fs.writeFile(path.join(folder, 'HASAR', i % 3 === 0 ? 'ŞASİ.jpeg' : 'ŞASE.jpg'), 'fixture');
  await fs.writeFile(path.join(folder, 'OLAY YERİ', 'OLAY YERİ1.jpeg'), 'fixture');
}
console.log(`Fixture üretildi: ${root} (${count} dosya; açık/kapalı, trafik/kasko, ağır hasar klasör varyasyonları dahil)`);
