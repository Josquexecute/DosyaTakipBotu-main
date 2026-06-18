import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { TrackingFileService } from '../dist-electron/main/tracking/tracking-file-service.js';
import { createDefaultTracking } from '../dist-electron/main/tracking/tracking-defaults.js';
import { parseMoney, distributeAmounts, inspectLaborExcel } from '../dist-electron/main/import/excel-importer.js';
import { analyzeDocuments } from '../dist-electron/main/import/document-analyzer.js';
import { analyzePhotos } from '../dist-electron/main/import/photo-analyzer.js';
import { LocalCacheStore } from '../dist-electron/main/local-cache/local-cache-store.js';
import { PcloudYearScanner } from '../dist-electron/main/scanner/pcloud-year-scanner.js';
import { FolderAnalyzer } from '../dist-electron/main/scanner/folder-analyzer.js';
import { getFolderFingerprint } from '../dist-electron/main/scanner/folder-fingerprint.js';
import { inferYearFromRootPath } from '../dist-electron/shared/constants.js';
import { isPathInsideNormalized } from '../dist-electron/shared/path-normalization.js';
import { parsePlateFromFolderName, parseDosyaNoFromFolderName } from '../dist-electron/main/scanner/case-folder-utils.js';
import { parsePartsResponse } from '../dist-electron/main/import/parts-list-analyzer.js';
import { normalizePartName } from '../dist-electron/shared/parca-sozlugu.js';
import { evaluatePlateMatch, looksLikePlate } from '../dist-electron/shared/plate-match.js';
import { resolvePlateFromPath, resolveCaseFolderFromPath, assertSelectedPhotoMatchesCase } from '../dist-electron/main/services/case-asset-guard.js';
import { classifyByRules, applyDistributionConstraints, roundTo250 } from '../dist-electron/shared/labor-rules.js';
import { lookupLearned, recordLearned, laborNameSimilarity } from '../dist-electron/shared/labor-learning-dictionary.js';
import { classifyLaborRow } from '../dist-electron/main/services/labor-classifier-service.js';
import { buildAutoLaborPreview } from '../dist-electron/main/services/labor-preview-service.js';
import { saveAutoLaborExcel } from '../dist-electron/main/services/labor-excel-writer.js';
import { buildGenericLaborWorkbook, loadWorkbook } from '../dist-electron/main/import/excel-importer.js';

const checks = [];
function ok(name) { checks.push({ name, ok: true }); console.log(`TAMAM - ${name}`); }
function fail(name, message) { checks.push({ name, ok: false, message }); console.error(`HATA - ${name}: ${message}`); }
function assert(condition, name, message) { condition ? ok(name) : fail(name, message); }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function round2(n) { return Math.round(n * 100) / 100; }
function makeTextPdf(lines) {
  const escapePdf = (value) => String(value).replace(/([\\()])/g, '\\$1');
  const textOps = lines.flatMap((line, index) => [index === 0 ? '' : '0 -18 Td', `(${escapePdf(line)}) Tj`]).filter(Boolean);
  const content = ['BT', '/F1 12 Tf', '72 720 Td', ...textOps, 'ET'].join('\n');
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n',
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
    `5 0 obj\n<< /Length ${Buffer.byteLength(content, 'ascii')} >>\nstream\n${content}\nendstream\nendobj\n`
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(pdf, 'ascii'));
    pdf += object;
  }
  const xref = Buffer.byteLength(pdf, 'ascii');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index < offsets.length; index += 1) pdf += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return pdf;
}

function makeDocx(text) {
  const body = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${String(text).split(/\r?\n/).map((line) => `<w:p><w:r><w:t>${escapeXml(line)}</w:t></w:r></w:p>`).join('')}</w:body></w:document>`;
  return makeStoredZip([
    ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'],
    ['word/document.xml', body]
  ]);
}

function escapeXml(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function makeStoredZip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, text, declaredUncompressedSize] of entries) {
    const nameBuffer = Buffer.from(name, 'utf8');
    const data = Buffer.from(text, 'utf8');
    const uncompressedSize = declaredUncompressedSize ?? data.length;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(0, 10);
    local.writeUInt32LE(0, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(uncompressedSize, 22);
    local.writeUInt16LE(nameBuffer.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, nameBuffer, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt32LE(0, 12);
    central.writeUInt32LE(0, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(uncompressedSize, 24);
    central.writeUInt16LE(nameBuffer.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt32LE(0, 34);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuffer);
    offset += local.length + nameBuffer.length + data.length;
  }
  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);
  return Buffer.concat([...locals, ...centrals, eocd]);
}

// v0.3.18: Para parser unit testleri Türkçe ve İngilizce formatları birlikte doğrular.
const moneyCases = [
  ['1.234,56 TL', 1234.56],
  ['₺ 1,234.56', 1234.56],
  ['1234,56', 1234.56],
  ['1234.56', 1234.56],
  ['1.234', 1234],
  ['1,234', 1234],
  ['-2.500,10 TRY', -2500.10]
];
for (const [input, expected] of moneyCases) {
  assert(parseMoney(input) === expected, `parseMoney ${input} -> ${expected}`, `Gelen=${parseMoney(input)}`);
}
assert(parseMoney('TOPLAM') === null, 'parseMoney parasal olmayan metni null döndürür', `Gelen=${parseMoney('TOPLAM')}`);

// v0.4.6: Gemini parça yanıtında tutar STRING gelirse (TR format) doğru parse edilmeli.
// Risk: düz Number("2.500") = 2.5 → Excel'e yanlış tutar. parseMoney ile çözüldü.
const partsAmountResponse = JSON.stringify({
  arac: { marka: 'Fiat', model: 'Egea', plaka: '34 ABC 123' },
  parcalar: [
    { ham: 'ön tampon', adet: null, tutar: '2.500', not: '' },
    { ham: 'kaput', adet: null, tutar: '₺ 1.250,50', not: '' },
    { ham: 'sağ ön kapı', adet: '2', tutar: 2500, not: '' },
    { ham: 'arka tampon', adet: null, tutar: 'yok', not: '' }
  ]
});
const partsAmount = parsePartsResponse(partsAmountResponse, '');
const amtByRaw = (raw) => partsAmount.rows.find((r) => r.raw === raw);
assert(amtByRaw('ön tampon')?.amount === 2500, 'parsePartsResponse "2.500" TR tutarını 2500 okur', `Gelen=${amtByRaw('ön tampon')?.amount}`);
assert(amtByRaw('kaput')?.amount === 1250.5, 'parsePartsResponse "₺ 1.250,50" tutarını 1250.50 okur', `Gelen=${amtByRaw('kaput')?.amount}`);
assert(amtByRaw('sağ ön kapı')?.amount === 2500 && amtByRaw('sağ ön kapı')?.quantity === 2, 'parsePartsResponse sayısal tutar + adet okur', JSON.stringify(amtByRaw('sağ ön kapı')));
assert(amtByRaw('arka tampon')?.amount === undefined, 'parsePartsResponse parasal olmayan tutarı atlar', JSON.stringify(amtByRaw('arka tampon')));

// v0.4.6: Yönsüz genel ifade ("tampon") otomatik "Ön Tampon" olur ama ambiguousSide işaretlenir.
const ambigTampon = normalizePartName('tampon');
assert(ambigTampon.canonical === 'Ön Tampon' && ambigTampon.ambiguousSide === true, 'normalizePartName yönsüz "tampon" için ambiguousSide işaretler', JSON.stringify(ambigTampon));
const onTampon = normalizePartName('ön tampon');
assert(onTampon.canonical === 'Ön Tampon' && !onTampon.ambiguousSide, 'normalizePartName "ön tampon" için ambiguousSide işaretlemez', JSON.stringify(onTampon));
const sagArkaTampon = normalizePartName('sağ arka tampon');
assert(sagArkaTampon.canonical === 'Sağ Arka Tampon' && !sagArkaTampon.ambiguousSide, 'normalizePartName "sağ arka tampon" net yönü belirsiz saymaz', JSON.stringify(sagArkaTampon));
const amortisor = normalizePartName('amartisör');
assert(amortisor.canonical === 'Amortisör' && !amortisor.ambiguousSide, 'normalizePartName yönsüz olmayan parça (amortisör) belirsiz değil', JSON.stringify(amortisor));

// v0.4.7: Merkezi plaka eşleşme + yanlış plakalı fotoğraf HARD-BLOCK testleri.
assert(looksLikePlate('34 BOP 660') === true && looksLikePlate('HASAR') === false, 'looksLikePlate plaka biçimini ayırt eder', `${looksLikePlate('34 BOP 660')}/${looksLikePlate('HASAR')}`);
const pmSame = evaluatePlateMatch('34 BOP 660', '34BOP660');
assert(pmSame.comparable && pmSame.matches, 'evaluatePlateMatch aynı plakayı (boşluklu/boşluksuz) eşler', JSON.stringify(pmSame));
const pmDiff = evaluatePlateMatch('34BOP660', '01FJG08');
assert(pmDiff.comparable && !pmDiff.matches, 'evaluatePlateMatch farklı plakayı uyuşmaz işaretler', JSON.stringify(pmDiff));
const pmUnknown = evaluatePlateMatch('34BOP660', 'HASAR');
assert(!pmUnknown.comparable && pmUnknown.matches, 'evaluatePlateMatch okunamayan adayda uyuşmazlık iddia etmez', JSON.stringify(pmUnknown));
const plateTestBase = path.join(os.tmpdir(), 'hb-plate-test');
assert(resolvePlateFromPath(path.join(plateTestBase, '01FJG08', 'HASAR', 'foto.jpg')) === '01FJG08', 'resolvePlateFromPath klasör yolundan plaka çıkarır', resolvePlateFromPath(path.join(plateTestBase, '01FJG08', 'HASAR', 'foto.jpg')));

const activeFolder = path.join(plateTestBase, '34BOP660');
// 1) Aktif klasör içindeki foto → engellenmez.
let blockedInside = false;
try { assertSelectedPhotoMatchesCase({ activePlate: '34 BOP 660', activeFolderPath: activeFolder, selectedFilePath: path.join(activeFolder, 'HASAR', 'a.jpg') }); } catch { blockedInside = true; }
assert(!blockedInside, 'assertSelectedPhotoMatchesCase aktif klasör içindeki fotoğrafı engellemez', `blocked=${blockedInside}`);
// 2) Farklı plakalı klasörden foto → HARD-BLOCK (PHOTO_PLATE_MISMATCH).
let mismatchError = null;
try { assertSelectedPhotoMatchesCase({ activePlate: '34 BOP 660', activeFolderPath: activeFolder, selectedFilePath: path.join(plateTestBase, '01FJG08', 'HASAR', 'b.jpg') }); } catch (e) { mismatchError = e; }
assert(mismatchError && mismatchError.code === 'PHOTO_PLATE_MISMATCH' && /güvenlik nedeniyle engellendi/.test(mismatchError.message), 'assertSelectedPhotoMatchesCase yanlış plakalı fotoğrafı sert engeller', mismatchError ? mismatchError.message : 'hata yok');
// 3) Plaka okunamayan, klasör dışı foto → uyuşmazlık kanıtlanamaz, engellenmez (yanlış-pozitif yok).
let blockedUnknown = false;
try { assertSelectedPhotoMatchesCase({ activePlate: '34 BOP 660', activeFolderPath: activeFolder, selectedFilePath: path.join(plateTestBase, 'genel', 'indirilenler', 'c.jpg') }); } catch { blockedUnknown = true; }
assert(!blockedUnknown, 'assertSelectedPhotoMatchesCase plakasız klasör-dışı fotoğrafta yanlış-pozitif üretmez', `blocked=${blockedUnknown}`);
// 4) v0.4.10: AYNI PLAKA ama FARKLI dosya klasörü → klasör kimliği farklı olduğundan HARD-BLOCK.
const owningTest = resolveCaseFolderFromPath(path.join(plateTestBase, '01FJG08', 'HASAR', 'foto.jpg'));
assert(owningTest && owningTest.plate === '01FJG08', 'resolveCaseFolderFromPath dosya klasörünü ve plakayı çözer', JSON.stringify(owningTest));
let samePlateDiffFolderError = null;
try { assertSelectedPhotoMatchesCase({ activePlate: '34 BOP 660', activeFolderPath: activeFolder, selectedFilePath: path.join(plateTestBase, 'Mayıs 2026', '34BOP660', 'HASAR', 'd.jpg') }); } catch (e) { samePlateDiffFolderError = e; }
assert(samePlateDiffFolderError && samePlateDiffFolderError.code === 'PHOTO_PLATE_MISMATCH' && /FARKLI dosya klasörü/.test(samePlateDiffFolderError.message), 'assertSelectedPhotoMatchesCase aynı plaka ama farklı dosya klasörünü engeller', samePlateDiffFolderError ? samePlateDiffFolderError.message : 'hata yok');
// 5) Aynı dosya klasörünün alt klasöründen (EVRAK/HASAR) foto → engellenmez.
let blockedSubfolder = false;
try { assertSelectedPhotoMatchesCase({ activePlate: '34 BOP 660', activeFolderPath: activeFolder, selectedFilePath: path.join(activeFolder, 'EVRAK', 'e.jpg') }); } catch { blockedSubfolder = true; }
assert(!blockedSubfolder, 'assertSelectedPhotoMatchesCase aktif dosyanın alt klasöründeki fotoğrafı engellemez', `blocked=${blockedSubfolder}`);

// === v0.4.11: AI destekli İşçilik Dağıtıcı ===
assert(roundTo250(2400) === 2500 && roundTo250(2625) === 2750 && roundTo250(0) === 0, 'roundTo250 tutarı 250 katına yuvarlar (kuruşsuz)', `${roundTo250(2400)}/${roundTo250(2625)}/${roundTo250(0)}`);

const clTampon = classifyByRules('Ön Tampon');
assert(clTampon.categories.includes('Kaporta') && clTampon.categories.includes('Boya'), 'classifyByRules tamponu Kaporta+Boya sınıflar', JSON.stringify(clTampon.categories));
assert(classifyByRules('Alternatör').categories[0] === 'Mekanik', 'classifyByRules alternatörü Mekanik sınıflar', JSON.stringify(classifyByRules('Alternatör')));
const clFar = classifyByRules('Sağ Ön Far');
assert(clFar.categories[0] === 'Elektrik' && clFar.needsReview === true, 'classifyByRules farı Elektrik + kontrol gerekli yapar', JSON.stringify(clFar));
assert(classifyByRules('Ön Cam').categories[0] === 'Cam', 'classifyByRules camı Cam sınıflar', JSON.stringify(classifyByRules('Ön Cam')));
assert(!classifyByRules('Sol Ön Çamurluk Davlumbazı').categories.includes('Cam'), 'classifyByRules çamurluk/davlumbazı cam sanmaz', JSON.stringify(classifyByRules('Sol Ön Çamurluk Davlumbazı')));
assert(classifyByRules('Radyator Panjuru').categories[0] === 'Kaporta', 'classifyByRules radyatör panjurunu mekanik değil kaporta sınıflar', JSON.stringify(classifyByRules('Radyator Panjuru')));
assert(classifyByRules('Sürücü Koltuğu').categories[0] === 'Döşeme/Kilit', 'classifyByRules koltuğu Döşeme/Kilit sınıflar', JSON.stringify(classifyByRules('Sürücü Koltuğu')));
const clUnknown = classifyByRules('Zxqw Bilinmeyen Parça');
assert(clUnknown.confidence === 'Düşük' && clUnknown.needsReview === true && clUnknown.categories.length > 0, 'classifyByRules bilinmeyen parçayı doldurur ama kontrol gerekli işaretler', JSON.stringify(clUnknown));
const constrained = applyDistributionConstraints(['Mekanik', 'Cam'], 'MOTOR');
assert(!constrained.categories.includes('Cam'), 'applyDistributionConstraints motor satırından cam işçiliğini çıkarır', JSON.stringify(constrained));

// Öğrenen sözlük kuraldan önceliklidir.
const learnedEntries = recordLearned([], { alias: 'Ön Tampon', categories: ['Mekanik'] });
const learnedDecision = classifyLaborRow('Ön Tampon', '', '', learnedEntries);
assert(learnedDecision.source === 'learned' && learnedDecision.categories[0] === 'Mekanik', 'classifyLaborRow öğrenilen kararı kuralın önüne alır', JSON.stringify(learnedDecision));
const lk = lookupLearned(learnedEntries, 'Ön Tampon');
assert(lk && lk.matchType === 'exact', 'lookupLearned tam eşleşmeyi bulur', JSON.stringify(lk));
assert(laborNameSimilarity('ön tampon', 'on tampon orjinal') > 0.3, 'laborNameSimilarity benzer adları yakalar', String(laborNameSimilarity('ön tampon', 'on tampon orjinal')));

// Uçtan uca: kategori-kolonlu Excel önizleme + güvenli çoklu-kolon yazma + orijinal korunur + yedek.
const aiTmp = await fs.mkdtemp(path.join(os.tmpdir(), 'hb-ai-labor-'));
const aiHeaders = ['Parça', 'Kod', 'Parça Tutarı', 'Kaporta', 'Boya', 'Mekanik', 'Elektrik', 'Cam', 'Döşeme/Kilit', 'Onarım'];
const aiRows = [
  ['Ön Tampon', 'TMP-1', 3000, '', '', '', '', '', '', ''],
  ['Alternatör', 'ALT-9', 1500, 999, '', '', '', 888, '', ''],
  ['Ön Cam', 'CAM-2', 2000, '', '', '', '', '', '', '']
];
const aiInput = path.join(aiTmp, 'ai-input.xlsx');
await fs.writeFile(aiInput, buildGenericLaborWorkbook(aiHeaders, aiRows));
const aiPreview = await buildAutoLaborPreview(aiInput, []);
assert(aiPreview.columns.length === 7, 'buildAutoLaborPreview 7 işçilik kategori sütununu başlıktan tespit eder', JSON.stringify(aiPreview.columns.map((c) => c.category)));
const pvTampon = aiPreview.rows.find((r) => r.partName === 'Ön Tampon');
assert(pvTampon && pvTampon.amounts.Kaporta > 0 && pvTampon.amounts.Boya > 0, 'önizleme tamponu Kaporta+Boya doldurur', JSON.stringify(pvTampon?.amounts));
const pvAlt = aiPreview.rows.find((r) => r.partName === 'Alternatör');
assert(pvAlt && pvAlt.amounts.Mekanik > 0 && !pvAlt.amounts.Cam, 'önizleme alternatöre Mekanik yazar, Cam yazmaz', JSON.stringify(pvAlt?.amounts));
assert(pvAlt && pvAlt.changed === true, 'önizleme seçilmeyen eski H-N değerlerini temizlenecek değişiklik sayar', JSON.stringify({ oldByColumn: pvAlt?.oldByColumn, amounts: pvAlt?.amounts }));

const aiOutput = path.join(aiTmp, 'ai-output.xlsx');
const aiSave = await saveAutoLaborExcel({ filePath: aiInput, outputPath: aiOutput, rows: aiPreview.rows.map((r) => ({ rowNumber: r.rowNumber, amounts: r.amounts })), columns: aiPreview.columns });
assert(aiSave.writtenCells > 0 && aiSave.changedRows >= 2, 'saveAutoLaborExcel onaylı tutarları yazar', JSON.stringify(aiSave));
const kaportaCol = aiPreview.columns.find((c) => c.category === 'Kaporta').column;
const mekanikCol = aiPreview.columns.find((c) => c.category === 'Mekanik').column;
const camCol = aiPreview.columns.find((c) => c.category === 'Cam').column;
const outWb = await loadWorkbook(aiOutput);
const writtenCell = outWb.sheet.cells.find((c) => c.ref === `${kaportaCol}${pvTampon.rowNumber}`);
assert(writtenCell && Number(writtenCell.numeric) === pvTampon.amounts.Kaporta, 'çıktı Excel Kaporta sütununa doğru tutarı yazdı', JSON.stringify({ written: writtenCell?.numeric, beklenen: pvTampon.amounts.Kaporta }));
const altMekanikCell = outWb.sheet.cells.find((c) => c.ref === `${mekanikCol}${pvAlt.rowNumber}`);
const altKaportaCell = outWb.sheet.cells.find((c) => c.ref === `${kaportaCol}${pvAlt.rowNumber}`);
const altCamCell = outWb.sheet.cells.find((c) => c.ref === `${camCol}${pvAlt.rowNumber}`);
assert(altMekanikCell && Number(altMekanikCell.numeric) === pvAlt.amounts.Mekanik, 'çıktı Excel mekanik satıra Mekanik tutarı yazar', JSON.stringify({ written: altMekanikCell?.numeric, beklenen: pvAlt.amounts.Mekanik }));
assert(altKaportaCell && Number(altKaportaCell.numeric) === 0 && altCamCell && Number(altCamCell.numeric) === 0, 'çıktı Excel mekanik satırdaki eski yanlış Kaporta/Cam değerlerini temizler', JSON.stringify({ kaporta: altKaportaCell?.numeric, cam: altCamCell?.numeric }));
const origWb = await loadWorkbook(aiInput);
const origCell = origWb.sheet.cells.find((c) => c.ref === `${kaportaCol}${pvTampon.rowNumber}`);
assert(!origCell || origCell.numeric === null, 'orijinal Excel değiştirilmedi (Kaporta hücresi hâlâ boş)', JSON.stringify(origCell ?? null));
assert(await fs.stat(aiSave.backupPath).then(() => true).catch(() => false), 'orijinalin yedeği oluşturuldu', aiSave.backupPath);

// v0.4.11 fixture: GERÇEK portal Excel (Liste.xlsx) ile kolon eşleme doğrulaması.
const portalFixture = path.join(process.cwd(), 'scripts', 'fixtures', 'liste-portal.xlsx');
const fixtureStatBefore = await fs.stat(portalFixture);
const portal = await buildAutoLaborPreview(portalFixture, []);
assert(portal.partNameColumn === 'C', 'portal: parça adı A değil C sütunundan okunur', `partNameColumn=${portal.partNameColumn}`);
assert(portal.partNameColumn !== 'A', 'portal: A sütunu (sıra no) parça adı olarak kullanılmaz', `partNameColumn=${portal.partNameColumn}`);
assert(portal.groupColumn === 'B', 'portal: B sütunu destekleyici grup olarak kullanılır', `groupColumn=${portal.groupColumn}`);
assert(portal.partCodeColumn === 'D', 'portal: D sütunu parça kodu olarak kullanılır', `partCodeColumn=${portal.partCodeColumn}`);
assert(portal.rows.every((r) => r.source !== 'learned'), 'portal: mevcut H-N değerleri otomatik öğrenme kaynağı olmaz', JSON.stringify(portal.rows.slice(0, 5).map((r) => ({ rowNumber: r.rowNumber, source: r.source }))));
const colOf = (cat) => portal.columns.find((c) => c.category === cat)?.column;
assert(colOf('Kaporta') === 'H' && colOf('Mekanik') === 'I' && colOf('Elektrik') === 'J' && colOf('Döşeme/Kilit') === 'K' && colOf('Cam') === 'L' && colOf('Boya') === 'M' && colOf('Onarım') === 'N', 'portal: H..N işçilik kategori sütunları doğru eşlenir', JSON.stringify(portal.columns.map((c) => `${c.column}:${c.category}`)));
const firstRow = portal.rows[0];
assert(firstRow && !/^\d+$/.test(firstRow.partName) && firstRow.partName.length > 2, 'portal: ilk satır parça adı sıra numarası değil gerçek açıklama', JSON.stringify(firstRow?.partName));
const findRow = (needle) => portal.rows.find((r) => r.partName.toUpperCase().includes(needle));
const dinamo = findRow('DINAMO') ?? findRow('SARJ');
assert(dinamo && dinamo.categories.includes('Mekanik') && !dinamo.categories.includes('Cam'), 'portal: şarj dinamosu Mekanik (cam değil)', JSON.stringify(dinamo));
const far = findRow('FAR');
assert(far && far.categories[0] === 'Elektrik' && !far.categories.includes('Kaporta'), 'portal: far Elektrik olarak sınıflanır (gelişigüzel kaporta yazılmaz)', JSON.stringify(far));
assert(far && far.needsReview === true, 'portal: far (dış elektrik) kontrol gerekli işaretlenir', JSON.stringify(far));
const koltuk = findRow('KOLTUK');
assert(koltuk && koltuk.categories.includes('Döşeme/Kilit'), 'portal: koltuk Döşeme/Kilit sınıflanır', JSON.stringify(koltuk));
const travers = findRow('TRAVERS');
assert(travers && travers.categories.includes('Kaporta'), 'portal: travers Kaporta sınıflanır', JSON.stringify(travers));
// Düşük güvenli satır yine doldurulur ama Kontrol gerekli işaretlenir; hiçbir satır boş kalmaz.
assert(portal.rows.every((r) => r.categories.length > 0), 'portal: her satıra işçilik kararı verilir (boş kalmaz)', `bos=${portal.rows.filter((r) => r.categories.length === 0).length}`);
// Önizleme dosyaya YAZMAZ; orijinal fixture değişmez (H-N mevcut değerleri otomatik öğrenilmez/yazılmaz).
const fixtureStatAfter = await fs.stat(portalFixture);
assert(fixtureStatAfter.size === fixtureStatBefore.size && fixtureStatAfter.mtimeMs === fixtureStatBefore.mtimeMs, 'portal: önizleme orijinal Excel dosyasını değiştirmez', 'fixture değişti');

const proportional = distributeAmounts([100, 200, 300], 1200);
assert(JSON.stringify(proportional) === JSON.stringify([200, 400, 600]), 'distributeAmounts oranlı dağıtım yapar', JSON.stringify(proportional));
const equal = distributeAmounts([0, null, 0], 300);
assert(JSON.stringify(equal) === JSON.stringify([100, 100, 100]), 'distributeAmounts boş/0 satırlarda eşit dağıtım yapar', JSON.stringify(equal));
const rounding = distributeAmounts([1, 1, 1], 100);
assert(round2(rounding.reduce((sum, value) => sum + value, 0)) === 100, 'distributeAmounts yuvarlama farkını son satıra dengeler', JSON.stringify(rounding));

// v0.3.18: Gerçek klasör adı corpus testleri.
const plateCases = [
  ['06 BGG 761', '06BGG761'],
  ['06BGG761 EVRAK', '06BGG761'],
  ['34BOP660 - DOSYA NO 2026-847291', '34BOP660'],
  ['01 FJG 08', '01FJG08'],
  ['72ADB474 KAPALI', '72ADB474']
];
for (const [folder, expected] of plateCases) {
  assert(parsePlateFromFolderName(folder) === expected, `Plaka corpus: ${folder}`, `Gelen=${parsePlateFromFolderName(folder)}`);
}
const dosyaCases = [
  ['34BOP660 - DOSYA NO 2026-847291', '2026-847291'],
  ['06BGG761 HASAR NO 2026/12345', '2026-12345'],
  ['72ADB474 ARSIV NO 123456789', '123456789'],
  ['01FJG08 2026 98765', '2026-98765']
];
for (const [folder, expected] of dosyaCases) {
  assert(parseDosyaNoFromFolderName(folder) === expected, `Dosya no corpus: ${folder}`, `Gelen=${parseDosyaNoFromFolderName(folder)}`);
}

// v0.3.18: Merge matrix — local edit vs disk delete sessiz kayıp olmamalı.
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'hasarbotu-behavior-'));
const casePath = path.join(root, 'Mayıs 2026', '06BGG761');
await fs.mkdir(path.join(casePath, 'EVRAK'), { recursive: true });
const service = new TrackingFileService(path.join(root, 'locks'));

const oversizedXlsxPath = path.join(root, 'oversized.xlsx');
await fs.writeFile(oversizedXlsxPath, makeStoredZip([
  ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'],
  ['xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheets><sheet name="Sayfa1" sheetId="1" id="rId1"/></sheets></workbook>'],
  ['xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'],
  ['xl/worksheets/sheet1.xml', '<worksheet><sheetData /></worksheet>', 90 * 1024 * 1024]
]));
let oversizedXlsxRejected = false;
try {
  await inspectLaborExcel(oversizedXlsxPath);
} catch (error) {
  oversizedXlsxRejected = /sinir|sınır|limit|guvenli/i.test(error instanceof Error ? error.message : String(error));
}
assert(oversizedXlsxRejected, 'Excel ZIP açılım sınırı büyük girdiyi reddeder', 'oversized.xlsx kabul edildi');

// v0.4.1 office corpus: Zorunlu evrak matrisi kullanıcının trafik/kasko listesine göre çalışır.
const trafficRequirementsPath = path.join(root, 'Haziran 2026', '34TRF001');
await fs.mkdir(path.join(trafficRequirementsPath, 'EVRAK'), { recursive: true });
for (const name of ['M EHLIYET.pdf', 'M RUHSAT.pdf', 'M POLICE.pdf', 'S POLICE.pdf', 'S EHLIYET.pdf', 'S RUHSAT.pdf', 'KTT.pdf', 'SBMM AGIR HASAR.png']) {
  await fs.writeFile(path.join(trafficRequirementsPath, 'EVRAK', name), 'fixture');
}
const trafficRequirements = await analyzeDocuments(trafficRequirementsPath, 'trafik', '34TRF001');
assert(!trafficRequirements.missingCritical.some((label) => /ALKOL/i.test(label)), 'Trafik dosyasında M Alkol artık zorunlu evrak değildir', JSON.stringify(trafficRequirements.missingCritical));
assert(trafficRequirements.missingCritical.includes('Tramer Sonucu'), 'Trafik dosyasında zabıt yoksa Tramer Sonucu zorunlu olur', JSON.stringify(trafficRequirements.missingCritical));

const kaskoRequirementsPath = path.join(root, 'Haziran 2026', '34KSK001');
await fs.mkdir(path.join(kaskoRequirementsPath, 'EVRAK'), { recursive: true });
for (const name of ['K EHLIYET.pdf', 'K RUHSAT.pdf', 'KASKO POLICE.pdf', 'BEYAN.pdf', 'SBMM AGIR HASAR.png']) {
  await fs.writeFile(path.join(kaskoRequirementsPath, 'EVRAK', name), 'fixture');
}
const kaskoRequirements = await analyzeDocuments(kaskoRequirementsPath, 'kasko', '34KSK001');
assert(kaskoRequirements.missingCritical.length === 0, 'Kasko zorunlu evrak listesi tam dosyada eksik üretmez', JSON.stringify(kaskoRequirements.missingCritical));

// v0.4.1 office corpus: Eski manuel NOTLAR.docx okunur ama takip.json içine otomatik yazılmaz.
const legacyNotePath = path.join(root, 'Haziran 2026', '34NOT123');
await fs.mkdir(path.join(legacyNotePath, 'EVRAK'), { recursive: true });
await fs.writeFile(path.join(legacyNotePath, 'NOTLAR.docx'), makeDocx('Servis arandı\nParça bekleniyor'));
const legacyNoteAnalysis = await analyzeDocuments(legacyNotePath, 'trafik', '34NOT123');
assert(legacyNoteAnalysis.legacyNotes?.[0]?.text.includes('Servis arandı'), 'Eski NOTLAR.docx metni okunur', JSON.stringify(legacyNoteAnalysis.legacyNotes));
let legacyTrackingCreated = true;
try { await fs.stat(service.getTrackingPath(legacyNotePath)); } catch { legacyTrackingCreated = false; }
assert(!legacyTrackingCreated, 'Eski NOTLAR.docx okuma takip.json dosyasını otomatik oluşturmaz', service.getTrackingPath(legacyNotePath));

// v0.4.1 office corpus: OLAY YERİ fotoğrafı zorunlu fotoğraf kontrolüne girer.
const photoCasePath = path.join(root, 'Haziran 2026', '34FOT001');
await fs.mkdir(path.join(photoCasePath, 'HASAR'), { recursive: true });
for (const name of ['HASAR 1.jpg', 'HASAR 2.jpg', 'HASAR 3.jpg', 'HASAR 4.jpg', 'KM.jpg', 'VITES.jpg', 'SASE.jpg']) {
  await fs.writeFile(path.join(photoCasePath, 'HASAR', name), Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
}
const missingOlayPhotos = await analyzePhotos(photoCasePath);
assert(missingOlayPhotos.hasOlayYeri === false && missingOlayPhotos.warnings.some((warning) => warning.includes('OLAY YERİ')), 'OLAY YERİ fotoğrafı eksikse uyarı üretilir', JSON.stringify(missingOlayPhotos.warnings));
await fs.mkdir(path.join(photoCasePath, 'OLAY YERI'), { recursive: true });
await fs.writeFile(path.join(photoCasePath, 'OLAY YERI', 'KAZA YERI.jpg'), Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
const completeOlayPhotos = await analyzePhotos(photoCasePath);
assert(completeOlayPhotos.hasOlayYeri === true && completeOlayPhotos.olayYeriPhotoCount === 1, 'OLAY YERİ fotoğrafı bulunduğunda sayılır', JSON.stringify(completeOlayPhotos));

// v0.4.1: EVRAK altindaki tek haneli ihbar PDF adi plaka satirina indekslenmeli.
const noticeCasePath = path.join(root, 'Haziran 2026', '34ABC123');
await fs.mkdir(path.join(noticeCasePath, 'EVRAK'), { recursive: true });
await fs.writeFile(path.join(noticeCasePath, 'EVRAK', '8-858393738.pdf'), makeTextPdf(['Ihbar Foyu', 'Zarar Goren Arac', 'Plaka 34ABC123']), 'utf-8');
const noticeAnalysis = await analyzeDocuments(noticeCasePath, 'trafik', '34ABC123');
assert(noticeAnalysis.claimNoticeNo === '8-858393738', 'Tek haneli prefix ihbar föyü PDF adı okunur', `claimNoticeNo=${noticeAnalysis.claimNoticeNo}`);
assert(noticeAnalysis.claimNoticeFiles.includes('8-858393738.pdf'), 'Tek haneli prefix ihbar föyü kaynak dosyası raporlanır', JSON.stringify(noticeAnalysis.claimNoticeFiles));
assert(noticeAnalysis.zararGorenPlateCheck?.status === 'matched', 'İhbar PDF Zarar Gören Araç plakası klasör plakasıyla eşleşir', JSON.stringify(noticeAnalysis.zararGorenPlateCheck));
const noticeIdentity = {
  caseKey: '34ABC123',
  plate: '34ABC123',
  dosyaNo: '',
  officeFileNo: '',
  claimNoticeNo: '',
  folderPath: noticeCasePath,
  monthFolder: 'Haziran 2026',
  isClosedFolder: false
};
const noticeFingerprint = await getFolderFingerprint(noticeCasePath);
const noticeIndexed = await new FolderAnalyzer(service).analyze(noticeIdentity, noticeFingerprint, 'Davranış Testi');
assert(noticeIndexed.item.plate === '34ABC123', 'İhbar PDF plaka klasörüne bağlı indekslenir', `plate=${noticeIndexed.item.plate}`);
assert(noticeIndexed.item.claimNoticeNo === '8-858393738', 'İhbar PDF numarası dosya listesi indeksine girer', `claimNoticeNo=${noticeIndexed.item.claimNoticeNo}`);
assert(noticeIndexed.item.searchText.includes('8 858393738'), 'İhbar PDF numarası arama metnine girer', `searchText=${noticeIndexed.item.searchText}`);
assert(noticeIndexed.item.documentAnalysis.zararGorenPlateCheck?.status === 'matched', 'İndekslenen dosyada PDF plaka kontrolü eşleşti olarak kalır', JSON.stringify(noticeIndexed.item.documentAnalysis.zararGorenPlateCheck));
let noticeTrackingCreated = true;
try { await fs.stat(service.getTrackingPath(noticeCasePath)); } catch { noticeTrackingCreated = false; }
assert(!noticeTrackingCreated, 'İhbar PDF indeks testi takip.json oluşturmaz', service.getTrackingPath(noticeCasePath));

const mismatchNoticeCasePath = path.join(root, 'Haziran 2026', '34ABC999');
await fs.mkdir(path.join(mismatchNoticeCasePath, 'EVRAK'), { recursive: true });
await fs.writeFile(path.join(mismatchNoticeCasePath, 'EVRAK', '8-858393738.pdf'), makeTextPdf(['Ihbar Foyu', 'Zarar Goren Arac', 'Plaka 06ABC123']), 'utf-8');
const mismatchNoticeAnalysis = await analyzeDocuments(mismatchNoticeCasePath, 'trafik', '34ABC999');
assert(mismatchNoticeAnalysis.zararGorenPlateCheck?.status === 'mismatch', 'İhbar PDF Zarar Gören Araç plaka uyuşmazlığını yakalar', JSON.stringify(mismatchNoticeAnalysis.zararGorenPlateCheck));
assert(mismatchNoticeAnalysis.warnings.some((warning) => warning.includes('plaka uyuşmazlığı')), 'PDF plaka uyuşmazlığı Risk Kontrol uyarılarına girer', JSON.stringify(mismatchNoticeAnalysis.warnings));

const twoColumnNoticeCasePath = path.join(root, 'Haziran 2026', '34ABC777');
await fs.mkdir(path.join(twoColumnNoticeCasePath, 'EVRAK'), { recursive: true });
await fs.writeFile(path.join(twoColumnNoticeCasePath, 'EVRAK', '8-858393739.pdf'), makeTextPdf(['Ihbar Foyu', 'Zarar Goren Arac', 'Plaka 06ABC123', 'Sigortali Arac', 'Plaka 34ABC777']), 'utf-8');
const twoColumnNoticeAnalysis = await analyzeDocuments(twoColumnNoticeCasePath, 'trafik', '34ABC777');
assert(twoColumnNoticeAnalysis.zararGorenPlateCheck?.status === 'matched', 'İhbar PDF iki plakalı bölgede klasör plakasını görürse yanlış uyuşmazlık üretmez', JSON.stringify(twoColumnNoticeAnalysis.zararGorenPlateCheck));

const inferredKaskoCasePath = path.join(root, 'Haziran 2026', '34KSK777');
await fs.mkdir(path.join(inferredKaskoCasePath, 'EVRAK'), { recursive: true });
for (const name of ['SIGORTALI RUHSAT.pdf', 'KASKO POLICE.pdf']) {
  await fs.writeFile(path.join(inferredKaskoCasePath, 'EVRAK', name), 'fixture');
}
const inferredKaskoAnalysis = await analyzeDocuments(inferredKaskoCasePath, undefined, '34KSK777');
assert(inferredKaskoAnalysis.claimType === 'kasko', 'Kasko evrakı SIGORTALI kelimesi yüzünden trafik diye sınıflandırılmaz', `claimType=${inferredKaskoAnalysis.claimType}`);

const sigortaPoliceCasePath = path.join(root, 'Haziran 2026', '34TRF777');
await fs.mkdir(path.join(sigortaPoliceCasePath, 'EVRAK'), { recursive: true });
for (const name of ['M EHLIYET.pdf', 'M RUHSAT.pdf', 'M POLICE.pdf', 'SIGORTA POLICE.pdf', 'S EHLIYET.pdf', 'S RUHSAT.pdf', 'ZABIT.pdf', 'SBMM AGIR HASAR.png']) {
  await fs.writeFile(path.join(sigortaPoliceCasePath, 'EVRAK', name), 'fixture');
}
const sigortaPoliceAnalysis = await analyzeDocuments(sigortaPoliceCasePath, 'trafik', '34TRF777');
assert(!sigortaPoliceAnalysis.missingCritical.includes('S Poliçe'), 'SIGORTA POLICE adı trafik dosyasında S Poliçe adayını karşılar', JSON.stringify(sigortaPoliceAnalysis.missingCritical));

const identity = {
  caseKey: '06BGG761',
  plate: '06BGG761',
  dosyaNo: '',
  officeFileNo: '2026/18',
  claimNoticeNo: '13-17947703',
  folderPath: casePath,
  monthFolder: 'Mayıs 2026',
  isClosedFolder: false
};
const base = createDefaultTracking(identity, 'Davranış Testi');
base.notes = [{ id: 'note-1', createdAt: '2026-06-12T10:00:00.000Z', createdBy: 'PC-1', text: 'Base not' }];
base.todos = [{ id: 'todo-1', title: 'Base görev', completed: false, priority: 'Normal', assignedTo: 'Omer', dueDate: '2026-06-20', createdAt: '2026-06-12T10:00:00.000Z' }];
base.status.workflowStatus = 'Yeni Dosya';
await fs.mkdir(path.dirname(service.getTrackingPath(casePath)), { recursive: true });

const current = clone(base);
current.notes = [];
current.todos = [];
current.metadata.writeId = randomUUID();
await fs.writeFile(service.getTrackingPath(casePath), JSON.stringify(current, null, 2), 'utf-8');

const local = clone(base);
local.notes[0].text = 'Yerel düzenlenmiş not';
local.todos[0].title = 'Yerel düzenlenmiş görev';
local.status.workflowStatus = 'Onarımda';
const result = await service.resolveConflict(casePath, current.metadata.revision, current.metadata.writeId, 'Davranış Testi', 'merge-safe', base, local);
assert(!('conflict' in result), 'Merge matrix conflict çözümü tamamlanır', JSON.stringify(result));
const merged = await service.readExisting(casePath);
assert(merged?.notes.some((note) => note.id === 'note-1' && note.text === 'Yerel düzenlenmiş not'), 'Merge matrix local edit vs disk delete notu korur', JSON.stringify(merged?.notes));
assert(merged?.todos.some((todo) => todo.id === 'todo-1' && todo.title === 'Yerel düzenlenmiş görev'), 'Merge matrix local edit vs disk delete görevi korur', JSON.stringify(merged?.todos));
assert(merged?.status.workflowStatus === 'Onarımda', 'Merge matrix scalar local değişikliği disk base ise korur', `workflowStatus=${merged?.status.workflowStatus}`);

const keyOrderCasePath = path.join(root, 'Mayıs 2026', '06BGG762');
await fs.mkdir(path.dirname(service.getTrackingPath(keyOrderCasePath)), { recursive: true });
const keyOrderIdentity = { ...identity, caseKey: '06BGG762', plate: '06BGG762', folderPath: keyOrderCasePath };
const keyOrderBase = createDefaultTracking(keyOrderIdentity, 'Davranış Testi');
const keyOrderTodo = { id: 'todo-key-order', title: 'Aynı görev', completed: false, priority: 'Normal', assignedTo: 'Omer', dueDate: '2026-06-20', createdAt: '2026-06-12T10:00:00.000Z' };
keyOrderBase.todos = [keyOrderTodo];
const keyOrderCurrent = clone(keyOrderBase);
keyOrderCurrent.todos = [];
keyOrderCurrent.metadata.writeId = randomUUID();
await fs.writeFile(service.getTrackingPath(keyOrderCasePath), JSON.stringify(keyOrderCurrent, null, 2), 'utf-8');
const keyOrderLocal = clone(keyOrderBase);
keyOrderLocal.todos = [{ title: keyOrderTodo.title, id: keyOrderTodo.id, priority: keyOrderTodo.priority, completed: keyOrderTodo.completed, dueDate: keyOrderTodo.dueDate, assignedTo: keyOrderTodo.assignedTo, createdAt: keyOrderTodo.createdAt }];
const keyOrderResult = await service.resolveConflict(keyOrderCasePath, keyOrderCurrent.metadata.revision, keyOrderCurrent.metadata.writeId, 'Davranış Testi', 'merge-safe', keyOrderBase, keyOrderLocal);
assert(!('conflict' in keyOrderResult), 'Merge matrix key-order conflict çözümü tamamlanır', JSON.stringify(keyOrderResult));
const keyOrderMerged = await service.readExisting(keyOrderCasePath);
assert(!keyOrderMerged?.todos.some((todo) => todo.id === 'todo-key-order'), 'Merge matrix key-order farkını gerçek local edit sanıp disk silmesini geri almaz', JSON.stringify(keyOrderMerged?.todos));

// v0.4.8 P1: resolveConflict, okunabilir özet (HASARBOTU_TAKIP_OZETI.txt) yazımı PATLASA bile
// başarılı olmalı; takip.json yazıldıysa işlem başarılı sayılır (mutate ile tutarlı davranış).
const sfCasePath = path.join(root, 'Haziran 2026', '06BGG763');
await fs.mkdir(path.dirname(service.getTrackingPath(sfCasePath)), { recursive: true });
const sfIdentity = { ...identity, caseKey: '06BGG763', plate: '06BGG763', folderPath: sfCasePath };
const sfBase = createDefaultTracking(sfIdentity, 'Davranış Testi');
sfBase.status.workflowStatus = 'Yeni Dosya';
const sfCurrent = clone(sfBase);
sfCurrent.metadata.writeId = randomUUID();
await fs.writeFile(service.getTrackingPath(sfCasePath), JSON.stringify(sfCurrent, null, 2), 'utf-8');
const sfLocal = clone(sfBase);
sfLocal.status.workflowStatus = 'Onarımda';
const originalWriteSummary = service.writeHumanSummary.bind(service);
service.writeHumanSummary = async () => { throw new Error('ÖZET YAZILAMADI (P1 test)'); };
let sfResult = null; let sfThrew = false;
try {
  sfResult = await service.resolveConflict(sfCasePath, sfCurrent.metadata.revision, sfCurrent.metadata.writeId, 'Davranış Testi', 'use-local', sfBase, sfLocal);
} catch { sfThrew = true; }
service.writeHumanSummary = originalWriteSummary;
assert(!sfThrew && sfResult && !('conflict' in sfResult), 'P1 resolveConflict özet yazımı patlasa da başarısız olmaz', JSON.stringify({ sfThrew, sfResult }));
const sfDisk = await service.readExisting(sfCasePath);
assert(sfDisk?.status.workflowStatus === 'Onarımda', 'P1 özet hatasına rağmen takip.json (ana veri) yazıldı', `workflowStatus=${sfDisk?.status.workflowStatus}`);

// v0.3.18: Dead-code ve yanıltıcı UI isimleri kontrolü.
for (const deadFile of [
  'src/main/scanner/background-refresh-service.ts',
  'src/main/scanner/pcloud-change-detector.ts',
  'src/main/local-cache/local-case-index.ts',
  'src/main/import/pdf-analyzer.ts'
]) {
  let exists = true;
  try { await fs.stat(deadFile); } catch { exists = false; }
  assert(!exists, `Dead code temizlendi: ${deadFile}`, `${deadFile} hâlâ mevcut`);
}
const detailSource = await fs.readFile('src/renderer/app/components/detail.ts', 'utf-8');
const layoutSource = await fs.readFile('src/renderer/app/components/layout.ts', 'utf-8');
const ipcDomainSource = await fs.readFile('src/main/services/ipc-domain-services.ts', 'utf-8');
// v0.4.1: Bağımsız "Risk Kontrolü" sekmesi "Sorunlar / Risk" sayfasına taşındı; risk etiketi
// artık detail.ts içindeki Risk Kontrol Özeti'nde yaşar. Yapay Zekâ yasağı aşağıda korunur.
assert(detailSource.includes('Risk Kontrol'), 'Yapay Zekâ etiketi Risk Kontrol olarak değiştirildi', 'Risk Kontrol etiketi yok');
assert(!detailSource.includes('Yapay Zekâ') && !layoutSource.includes('Yapay Zekâ'), 'Uygulama ana UI içinde yanıltıcı Yapay Zekâ etiketi kalmadı', 'Yapay Zekâ etiketi hâlâ var');
assert(ipcDomainSource.includes('sanitizeNoteText') && !ipcDomainSource.includes('const text = safeFileDisplayName(args.text.trim())'), 'Not metni dosya adı temizleyiciyle 180 karaktere kırpılmaz', 'Not akışı safeFileDisplayName ile kırpılıyor');


// RC5: Per-case cache orphan dosyaları silinmiş/taşınmış dosyaları ghost case olarak geri getirmemeli.
const cache = new LocalCacheStore(path.join(root, 'cache-ghost'));
await cache.ensure();
function minimalCase(folderPath, plate, revision = 1) {
  const identity = {
    caseKey: plate,
    plate,
    dosyaNo: '',
    officeFileNo: '',
    claimNoticeNo: '',
    folderPath,
    monthFolder: 'Nisan 2026',
    isClosedFolder: false
  };
  const tracking = createDefaultTracking(identity, 'Cache Testi');
  tracking.metadata.revision = revision;
  tracking.metadata.writeId = `write-${revision}-${plate}`;
  return {
    folderPath,
    folderName: path.basename(folderPath),
    plate,
    dosyaNo: '',
    officeFileNo: '',
    claimNoticeNo: '',
    monthFolder: 'Nisan 2026',
    isClosedFolder: false,
    claimType: 'unknown',
    serviceName: revision > 1 ? 'Cache Servis' : '',
    workflowStatus: tracking.status.workflowStatus,
    dosyaDurumu: tracking.status.dosyaDurumu,
    sorumlu: tracking.assignment.sorumlu,
    takipTarihi: tracking.assignment.takipTarihi,
    oncelik: tracking.assignment.oncelik,
    updatedAt: tracking.metadata.updatedAt,
    revision,
    tracking,
    documentAnalysis: { claimType: 'unknown', evrakFolderExists: true, filesScanned: 0, requirements: [], missingCritical: [], claimNoticeNo: '', claimNoticeFiles: [], hasKttOrZabitOrBeyan: false, counterpartyPolicyCandidate: false, conflictFiles: [], warnings: [] },
    photoAnalysis: { hasarFolderExists: true, totalImageFiles: 0, damagePhotoCount: 0, hasKm: false, hasVites: false, hasSaseOrSasi: false, unsupportedFiles: [], unsupportedPhotos: [], corruptCandidates: [], previews: [], warnings: [] },
    folderContents: { totalFiles: 0, sampleFiles: [], groups: [] },
    fingerprint: { folderPath, mtimeMs: 0, size: 0, childCount: 0, evrakMtimeMs: 0, hasarMtimeMs: 0, trackingMtimeMs: 0, hash: '' },
    searchText: plate,
    statusIsClosed: false
  };
}
const liveCase = minimalCase(path.join(root, 'live', 'case1'), '06ABC123', 1);
const enrichedCase = minimalCase(liveCase.folderPath, '06ABC123', 5);
const orphanCase = minimalCase(path.join(root, 'live', 'deleted'), '06DEF456', 9);
await cache.writeIndex({ schemaVersion: 1, rootPath: path.join(root, 'live'), generatedAt: new Date().toISOString(), cases: [liveCase] }, 2026);
await cache.writeCaseCache(enrichedCase);
await cache.writeCaseCache(orphanCase);
const mergedIndex = await cache.readIndex(2026);
assert(mergedIndex.cases.length === 1 && mergedIndex.cases[0].folderPath === liveCase.folderPath, 'Per-case cache orphan ghost case olarak geri eklenmez', JSON.stringify(mergedIndex.cases.map((c) => c.folderPath)));
assert(mergedIndex.cases[0].tracking.metadata.revision === 5 && mergedIndex.cases[0].serviceName === 'Cache Servis', 'Per-case cache mevcut index dosyasını zenginleştirir', JSON.stringify({ revision: mergedIndex.cases[0].tracking.metadata.revision, serviceName: mergedIndex.cases[0].serviceName }));
await cache.writeIndex(mergedIndex, 2026);
let orphanCacheExists = true;
try { await fs.stat(cache.caseCachePath(orphanCase.folderPath)); } catch { orphanCacheExists = false; }
assert(!orphanCacheExists, 'Per-case cache prune orphan AppData cache dosyasını temizler', cache.caseCachePath(orphanCase.folderPath));

// RC5: Liste Excel export butonu tek kaynakta render edilir; küçük ve virtual list için ortaktır.
const casesSource = await fs.readFile('src/renderer/app/components/cases.ts', 'utf-8');
const exportActionCount = (casesSource.match(/data-action="export-cases-excel"/g) ?? []).length;
assert(exportActionCount === 1 && casesSource.includes('renderCaseListHeader(filtered.length, modeText)'), 'Liste Excel export butonu tek kaynakta ve her liste modunda kullanılıyor', `count=${exportActionCount}`);

// RC5: Renderer dropdownları shared workflow constants kaynağını kullanır.
assert(detailSource.includes('CLAIM_TYPES') && detailSource.includes('DOSYA_DURUMLARI') && detailSource.includes('WORKFLOW_STATUSES') && detailSource.includes('PRIORITIES'), 'Renderer dropdownları shared constants üzerinden besleniyor', 'Shared dropdown importları eksik');
assert(!detailSource.includes("['Yeni Dosya'") && !detailSource.includes("['unknown','trafik','kasko'") && !detailSource.includes("['Düşük','Normal','Yüksek','Kritik']"), 'Renderer içinde kritik dropdown hardcoded değerleri kaldırıldı', 'Hardcoded dropdown dizisi kaldı');

// RC5: Türkçe path karşılaştırması ve yıl çıkarımı.
assert(isPathInsideNormalized('P:\\BARAN GLOBAL EKSPERTIZ\\2026\\06ABC123', 'P:\\BARAN GLOBAL EKSPERTİZ\\2026'), 'Türkçe İ/I path farkı güvenli kök kontrolünü bozmaz', 'EKSPERTIZ/EKSPERTİZ eşleşmedi');
assert(inferYearFromRootPath('P:\\BARAN GLOBAL EKSPERTİZ\\2027') === 2027, 'RootPath 2027 ise aktif cache yılı 2027 çıkarılır', `year=${inferYearFromRootPath('P:\\BARAN GLOBAL EKSPERTİZ\\2027')}`);

// RC5: Rollback dokümanı Disk Baseline Kabul adımını anlatır.
const rollbackDoc = await fs.readFile('docs/GERI_DONUS_PLANI.md', 'utf-8');
assert(rollbackDoc.includes('Disk Baseline Kabul') && rollbackDoc.includes('local write-index baseline'), 'Rollback dokümanı Disk Baseline Kabul adımını anlatıyor', 'Disk Baseline Kabul dokümanı eksik');

// v0.4.1 safety: Daha önce görülen takip.json kaybolursa default takip cache'i eski güvenli verinin üstüne yazılmamalı.
const missingRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'hasarbotu-missing-tracking-'));
const missingYearRoot = path.join(missingRoot, 'pCloud Drive (P)', 'BARAN GLOBAL EKSPERTIZ', '2026');
const missingCasePath = path.join(missingYearRoot, 'Mayis 2026', '06ABC123');
await fs.mkdir(path.join(missingCasePath, 'EVRAK'), { recursive: true });
await fs.writeFile(path.join(missingCasePath, 'EVRAK', 'M RUHSAT.pdf'), '%PDF', 'utf-8');
const missingCache = new LocalCacheStore(path.join(missingRoot, 'appdata'));
await missingCache.ensure();
const missingScanner = new PcloudYearScanner(missingCache);
const missingService = new TrackingFileService(missingCache.locksDir);
const missingIdentity = {
  caseKey: '06ABC123',
  plate: '06ABC123',
  dosyaNo: '',
  officeFileNo: '2026/99',
  claimNoticeNo: '99-12345678',
  folderPath: missingCasePath,
  monthFolder: 'Mayis 2026',
  isClosedFolder: false
};
const missingSettings = {
  rootPath: missingYearRoot,
  rootPathConfirmed: true,
  theme: 'light',
  zoom: 1,
  activeUser: 'Eksik Takip Testi',
  activeComputer: 'TEST-PC',
  users: ['Eksik Takip Testi'],
  scanIntervals: { fullYearLightMs: 300000 }
};
const createdMissingTracking = await missingService.ensureTracking(missingIdentity, 'Eksik Takip Testi');
await missingCache.recordSeenTracking(missingCasePath, createdMissingTracking.tracking, missingYearRoot);
const missingBaseline = await missingScanner.scan(missingSettings);
const missingBaselineCase = missingBaseline.index.cases.find((item) => item.folderPath === missingCasePath);
await fs.rm(path.dirname(missingService.getTrackingPath(missingCasePath)), { recursive: true, force: true });
const missingAfterDelete = await missingScanner.scan(missingSettings);
const missingAfterDeleteCase = missingAfterDelete.index.cases.find((item) => item.folderPath === missingCasePath);
let missingTrackingRecreated = true;
try { await fs.stat(missingService.getTrackingPath(missingCasePath)); } catch { missingTrackingRecreated = false; }
assert(missingAfterDelete.report.issues.some((issue) => issue.type === 'partial-sync-missing-tracking'), 'Daha önce görülen takip.json kaybolursa scan issue üretir', JSON.stringify(missingAfterDelete.report.issues));
assert(missingAfterDeleteCase?.caseIssues?.some((issue) => issue.type === 'partial-sync-missing-tracking'), 'Kayıp takip.json dosya sorunlarına eklenir', JSON.stringify(missingAfterDeleteCase?.caseIssues ?? []));
assert(missingAfterDeleteCase?.tracking.metadata.writeId === missingBaselineCase?.tracking.metadata.writeId, 'Kayıp takip.json default veriyle güvenli cache üstüne yazılmaz', JSON.stringify({ before: missingBaselineCase?.tracking.metadata.writeId, after: missingAfterDeleteCase?.tracking.metadata.writeId }));
assert(!missingTrackingRecreated, 'Kayıp takip.json kullanıcı onayı olmadan yeniden oluşturulmaz', missingService.getTrackingPath(missingCasePath));

const failed = checks.filter((item) => !item.ok);
if (failed.length) {
  console.error(`Davranış regresyon testleri başarısız: ${failed.length} hata.`);
  process.exit(1);
}
console.log(`Davranış regresyon testleri geçti: ${checks.length} kontrol.`);
