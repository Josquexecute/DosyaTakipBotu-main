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
import { deleteLearned, exportLaborLearningJson, importLaborLearningJson, isLearnableLaborAlias, lookupLearned, recordLearned, laborNameSimilarity, setLearnedActive, updateLearned } from '../dist-electron/shared/labor-learning-dictionary.js';
import { AUTO_LABOR_DEFAULT_PAGE_SIZE, AUTO_LABOR_PAGE_SIZE_OPTIONS, AUTO_LABOR_ROWS_PER_PAGE, buildAutoLaborPageModel, buildAutoLaborStats, buildAutoLaborSavePlan, autoLaborFilterMatches, autoLaborSearchMatches, normalizeAutoLaborPageSize } from '../dist-electron/shared/auto-labor-view-model.js';
import { classifyLaborRow } from '../dist-electron/main/services/labor-classifier-service.js';
import { buildAutoLaborPreview } from '../dist-electron/main/services/labor-preview-service.js';
import { saveAutoLaborExcel } from '../dist-electron/main/services/labor-excel-writer.js';
import { buildGenericLaborWorkbook, loadWorkbook } from '../dist-electron/main/import/excel-importer.js';
import { applyHeavyDamageEdits, buildHeavyDamagePreview, classifyHeavyDamagePart, generateHeavyDamageAssessmentMailDraft, generateHeavyDamageAssessmentNote, heavyDamageFilterMatches, HEAVY_DAMAGE_ECONOMIC_THRESHOLD, HEAVY_DAMAGE_THRESHOLD } from '../dist-electron/shared/heavy-damage-rules.js';

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
const clMotorTesisat = classifyByRules('MOTOR ELEKTRİK TESİSATI');
assert(clMotorTesisat.categories[0] === 'Elektrik', 'classifyByRules motor elektrik tesisatını Elektrik sınıflar', JSON.stringify(clMotorTesisat));
const clMotorKaputu = classifyByRules('MOTOR KAPUTU');
assert(clMotorKaputu.categories.includes('Kaporta') && clMotorKaputu.categories.includes('Boya') && !clMotorKaputu.categories.includes('Mekanik'), 'classifyByRules motor kaputunu Kaporta+Boya sınıflar', JSON.stringify(clMotorKaputu));
assert(classifyByRules('SOL GÜNDÜZ SÜRÜŞ FARI').categories[0] === 'Elektrik', 'classifyByRules gündüz sürüş farını Elektrik sınıflar', JSON.stringify(classifyByRules('SOL GÜNDÜZ SÜRÜŞ FARI')));
assert(classifyByRules('YAĞ POMPASI').categories[0] === 'Mekanik', 'classifyByRules yağ pompasını Mekanik sınıflar', JSON.stringify(classifyByRules('YAĞ POMPASI')));
assert(classifyByRules('EGR VALFİ').categories[0] === 'Mekanik', 'classifyByRules EGR valfini Mekanik sınıflar', JSON.stringify(classifyByRules('EGR VALFİ')));
assert(classifyByRules('KOMPLE HAVA FİLTRESİ').categories[0] === 'Mekanik', 'classifyByRules hava filtresini Mekanik sınıflar', JSON.stringify(classifyByRules('KOMPLE HAVA FİLTRESİ')));
const clDavlumbaz = classifyByRules('ÇAMURLUK DAVLUMBAZI');
assert(clDavlumbaz.categories[0] === 'Kaporta' && !clDavlumbaz.categories.includes('Boya') && clDavlumbaz.needsReview === true, 'classifyByRules çamurluk davlumbazını Kaporta + kontrol gerekli yapar', JSON.stringify(clDavlumbaz));
assert(classifyByRules('Sürücü Koltuğu').categories[0] === 'Döşeme/Kilit', 'classifyByRules koltuğu Döşeme/Kilit sınıflar', JSON.stringify(classifyByRules('Sürücü Koltuğu')));
const clUnknown = classifyByRules('Zxqw Bilinmeyen Parça');
assert(clUnknown.confidence === 'Düşük' && clUnknown.needsReview === true && clUnknown.categories.length > 0, 'classifyByRules bilinmeyen parçayı doldurur ama kontrol gerekli işaretler', JSON.stringify(clUnknown));
const constrained = applyDistributionConstraints(['Mekanik', 'Cam'], 'MOTOR');
assert(!constrained.categories.includes('Cam'), 'applyDistributionConstraints motor satırından cam işçiliğini çıkarır', JSON.stringify(constrained));
const constrainedElectric = applyDistributionConstraints(['Elektrik', 'Kaporta', 'Boya', 'Mekanik'], 'MOTOR ELEKTRIK TESISATI');
assert(constrainedElectric.categories.length === 1 && constrainedElectric.categories[0] === 'Elektrik', 'applyDistributionConstraints elektrik satırından kaporta/boya/mekanik çakışmasını çıkarır', JSON.stringify(constrainedElectric));
const constrainedFalseCam = applyDistributionConstraints(['Kaporta', 'Cam'], 'CAMURLUK DAVLUMBAZI');
assert(constrainedFalseCam.categories.includes('Kaporta') && !constrainedFalseCam.categories.includes('Cam'), 'applyDistributionConstraints çamurluk/davlumbaz kelimesini cam saymaz', JSON.stringify(constrainedFalseCam));

const criticalLaborCases = [
  ['MOTOR ELEKTRİK TESİSATI', ['Elektrik'], ['Mekanik', 'Kaporta', 'Cam']],
  ['MOTOR KAPUTU', ['Kaporta', 'Boya'], ['Mekanik', 'Cam']],
  ['SOL GÜNDÜZ SÜRÜŞ FARI', ['Elektrik'], ['Kaporta', 'Mekanik', 'Cam']],
  ['YAĞ POMPASI', ['Mekanik'], ['Cam', 'Kaporta']],
  ['EGR VALFİ', ['Mekanik'], ['Cam', 'Kaporta']],
  ['KOMPLE HAVA FİLTRESİ', ['Mekanik'], ['Cam', 'Kaporta']],
  ['RADYATÖR PANJURU', ['Kaporta'], ['Mekanik', 'Cam']],
  ['ÇAMURLUK DAVLUMBAZI', ['Kaporta'], ['Cam', 'Mekanik']],
  ['ŞARJ DİNAMOSU', ['Mekanik'], ['Cam', 'Kaporta']],
  ['ALTERNATÖR', ['Mekanik'], ['Cam', 'Kaporta']],
  ['SİGORTA KUTUSU', ['Elektrik'], ['Kaporta', 'Mekanik', 'Cam']],
  ['TESİSAT', ['Elektrik'], ['Kaporta', 'Mekanik', 'Cam']],
  ['BEYİN', ['Elektrik'], ['Kaporta', 'Mekanik', 'Cam']],
  ['SENSÖR', ['Elektrik'], ['Kaporta', 'Mekanik', 'Cam']],
  ['STOP LAMBASI', ['Elektrik'], ['Kaporta', 'Mekanik', 'Cam']],
  ['RADAR SENSÖRÜ', ['Elektrik'], ['Kaporta', 'Mekanik', 'Cam']],
  ['GERİ GÖRÜŞ KAMERASI', ['Elektrik'], ['Kaporta', 'Mekanik', 'Cam']]
];
for (const [name, expected, forbidden] of criticalLaborCases) {
  const decision = classifyByRules(name);
  assert(expected.every((cat) => decision.categories.includes(cat)), `v0.5 karar motoru beklenen sınıf: ${name}`, JSON.stringify(decision));
  assert(forbidden.every((cat) => !decision.categories.includes(cat)), `v0.5 karar motoru yasak sınıfı engeller: ${name}`, JSON.stringify(decision));
  assert(decision.reason.includes('Kanıt:'), `v0.5 karar motoru kanıt gerekçesi üretir: ${name}`, decision.reason);
}
assert(classifyByRules('MOTOR ELEKTRİK TESİSATI').reason.includes('Negatif'), 'v0.5 motor elektrik tesisatında mekanik negatif kural gerekçesi yazar', classifyByRules('MOTOR ELEKTRİK TESİSATI').reason);
assert(classifyByRules('RADYATÖR PANJURU').reason.includes('Negatif'), 'v0.5 radyatör panjurunda mekanik negatif kural gerekçesi yazar', classifyByRules('RADYATÖR PANJURU').reason);

// Öğrenen sözlük kuraldan önceliklidir.
const learnedEntries = recordLearned([], { alias: 'Ön Tampon', categories: ['Mekanik'] });
const learnedDecision = classifyLaborRow('Ön Tampon', '', '', learnedEntries);
assert(learnedDecision.source === 'learned' && learnedDecision.categories[0] === 'Mekanik', 'classifyLaborRow öğrenilen kararı kuralın önüne alır', JSON.stringify(learnedDecision));
const lk = lookupLearned(learnedEntries, 'Ön Tampon');
assert(lk && lk.matchType === 'exact', 'lookupLearned tam eşleşmeyi bulur', JSON.stringify(lk));
assert(laborNameSimilarity('ön tampon', 'on tampon orjinal') > 0.3, 'laborNameSimilarity benzer adları yakalar', String(laborNameSimilarity('ön tampon', 'on tampon orjinal')));
const learnedWithReason = recordLearned([], { alias: 'Sigorta Kutusu', partCode: 'ELK-1', categories: ['Elektrik'], reason: 'Kullanıcı önizlemede elektrik kararı onayladı.' });
assert(learnedWithReason[0]?.reason?.includes('elektrik kararı'), 'recordLearned kullanıcı karar gerekçesini saklar', JSON.stringify(learnedWithReason[0]));
assert(deleteLearned(learnedWithReason, { alias: 'Sigorta Kutusu', partCode: 'ELK-1' }).length === 0, 'deleteLearned yanlış öğrenmeyi silme altyapısı sağlar', JSON.stringify(learnedWithReason));

// Uçtan uca: kategori-kolonlu Excel önizleme + güvenli çoklu-kolon yazma + orijinal korunur + yedek.
const disabledLearned = setLearnedActive(learnedEntries, { normalizedName: learnedEntries[0].normalizedName }, false);
assert(!lookupLearned(disabledLearned, 'Ã–n Tampon'), 'v0.5.0 ogrenme sozlugu devre disi kaydi AI kararinda kullanmaz', JSON.stringify(disabledLearned[0]));
const enabledLearned = setLearnedActive(disabledLearned, { normalizedName: learnedEntries[0].normalizedName }, true);
assert(lookupLearned(enabledLearned, 'Ã–n Tampon')?.entry.active !== false, 'v0.5.0 ogrenme sozlugu tekrar aktif edilen kaydi AI kararinda kullanir', JSON.stringify(enabledLearned[0]));
const editedLearned = updateLearned(enabledLearned, { normalizedName: learnedEntries[0].normalizedName, categories: ['Elektrik'], reason: 'Manuel yonetim duzeltmesi', needsReview: true, active: true });
const editedDecision = classifyLaborRow('Ã–n Tampon', '', '', editedLearned);
assert(editedDecision.source === 'learned' && editedDecision.categories[0] === 'Elektrik' && editedDecision.needsReview, 'v0.5.0 ogrenme sozlugu duzenleme sonraki AI kararini etkiler', JSON.stringify(editedDecision));
const deletedLearned = deleteLearned(editedLearned, { normalizedName: learnedEntries[0].normalizedName });
assert(!lookupLearned(deletedLearned, 'Ã–n Tampon'), 'v0.5.0 ogrenme sozlugu silinen kaydi AI kararinda kullanmaz', JSON.stringify(deletedLearned));
assert(!isLearnableLaborAlias('') && !isLearnableLaborAlias('1') && !isLearnableLaborAlias('49') && !isLearnableLaborAlias('A 12') && isLearnableLaborAlias('EGR Valfi'), 'v0.5.0 ogrenme sozlugu bos/sira numarasi/anlamsiz kaydi ogrenmez', 'alias guard');
assert(recordLearned([], { alias: '49', categories: ['Kaporta'] }).length === 0, 'v0.5.0 ogrenme sozlugu sira numarasi kaynakli kaydi dosyaya eklemez', JSON.stringify(recordLearned([], { alias: '49', categories: ['Kaporta'] })));
const exportedLearningJson = exportLaborLearningJson(editedLearned);
assert(exportedLearningJson.includes('entries') && exportedLearningJson.includes('Elektrik'), 'v0.5.0 ogrenme sozlugu disa aktarma JSON uretir', exportedLearningJson);
let brokenImportRejected = false;
try { importLaborLearningJson([], '{bozuk json'); } catch { brokenImportRejected = true; }
assert(brokenImportRejected, 'v0.5.0 ogrenme sozlugu bozuk JSON ice aktarmayi reddeder', 'broken json rejected');
const importedLearning = importLaborLearningJson([], exportedLearningJson);
assert(importedLearning.added === 1 && importedLearning.updated === 0 && importedLearning.skipped === 0 && importedLearning.entries.length === 1, 'v0.5.0 ogrenme sozlugu gecerli JSON ice aktarma kayit ekler', JSON.stringify(importedLearning));
const conflictLearning = importLaborLearningJson(importedLearning.entries, exportLaborLearningJson(updateLearned(importedLearning.entries, { normalizedName: importedLearning.entries[0].normalizedName, categories: ['Mekanik'], reason: 'Import guncellemesi' })));
assert(conflictLearning.added === 0 && conflictLearning.updated === 1 && conflictLearning.skipped === 0 && conflictLearning.entries[0].categories[0] === 'Mekanik', 'v0.5.0 ogrenme sozlugu cakismali import raporunu dogru doner', JSON.stringify(conflictLearning));

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
const excelWorkflowSource = await fs.readFile(path.join(process.cwd(), 'src', 'main', 'services', 'excel-workflow-service.ts'), 'utf-8');
assert(excelWorkflowSource.includes('approvedExcelFiles.has(excelPath)') && excelWorkflowSource.includes('AI önizleme ile'), 'AI autoLaborSave önizleme/uygulama içi seçim olmadan Excel yazmaz', 'approvedExcelFiles güvenlik kapısı bulunamadı');

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

// v0.5.0: gerçek portal kolon DÜZENİNDE geniş problemli parça fixture'ı.
const portalV2Headers = ['Sıra', 'DVN Grubu', 'İşçilik Açıklaması', 'Parça Kodu', 'Boş', 'Parça Sahiplenme Bedeli', 'Parça Orijinal Bedeli', 'Kaporta', 'Mekanik', 'Elektrik', 'Döşeme-Kilit', 'Cam', 'Boya', 'Onarım'];
const portalV2Rows = [
  [1, 'MEKANIK', 'MOTOR ELEKTRİK TESİSATI', 'ELK-001', '', 1000, 2000, 999, 999, '', '', 999, '', ''],
  [2, 'MEKANIK', 'MOTOR KAPUTU', 'KPT-001', '', 2000, 3000, '', 888, '', '', '', '', ''],
  [3, 'AYDINLATMA', 'SOL GÜNDÜZ SÜRÜŞ FARI', 'FAR-001', '', 500, 1000, 777, '', '', '', '', '', ''],
  [4, 'CAM', 'YAĞ POMPASI', 'MEK-001', '', 500, 1000, '', '', '', '', 666, '', ''],
  [5, 'KAPORTA', 'EGR VALFİ', 'MEK-002', '', 500, 1000, 555, '', '', '', '', '', ''],
  [6, 'KAPORTA', 'KOMPLE HAVA FİLTRESİ', 'MEK-003', '', 500, 1000, '', '', '', '', 444, '', ''],
  [7, 'MEKANIK', 'RADYATÖR PANJURU', 'KAP-001', '', 500, 1000, '', 333, '', '', '', '', ''],
  [8, 'CAM', 'ÇAMURLUK DAVLUMBAZI', 'KAP-002', '', 500, 1000, '', '', '', '', 222, '', ''],
  [9, 'ELEKTRIK', 'ŞARJ DİNAMOSU', 'MEK-004', '', 500, 1000, '', '', 111, '', '', '', ''],
  [10, 'ELEKTRIK', 'ALTERNATÖR', 'MEK-005', '', 500, 1000, '', '', 111, '', '', '', ''],
  [11, 'KAPORTA', 'SİGORTA KUTUSU', 'ELK-002', '', 500, 1000, 111, '', '', '', '', '', ''],
  [12, 'KAPORTA', 'RADAR SENSÖRÜ', 'ELK-003', '', 500, 1000, 111, '', '', '', '', '', ''],
  [13, 'KAPORTA', 'ÖN CAM', 'CAM-001', '', 500, 1000, 111, '', '', '', '', '', ''],
  [14, 'GENEL', 'ZXQW BİLİNMEYEN PARÇA', 'UNK-001', '', 500, 1000, '', '', '', '', '', '', '']
];
const portalV2Input = path.join(aiTmp, 'portal-v2-shape.xlsx');
await fs.writeFile(portalV2Input, buildGenericLaborWorkbook(portalV2Headers, portalV2Rows));
const portalV2StatBefore = await fs.stat(portalV2Input);
const portalV2 = await buildAutoLaborPreview(portalV2Input, []);
assert(portalV2.partNameColumn === 'C' && portalV2.groupColumn === 'B' && portalV2.partCodeColumn === 'D', 'portal v2 fixture: A sıra, B grup, C açıklama, D kod olarak okunur', JSON.stringify({ part: portalV2.partNameColumn, group: portalV2.groupColumn, code: portalV2.partCodeColumn }));
assert(portalV2.rows.every((r) => r.source !== 'learned'), 'portal v2 fixture: mevcut H-N değerleri otomatik öğrenilmez', JSON.stringify(portalV2.rows.map((r) => r.source)));
assert(portalV2.rows.every((r) => r.categories.length > 0), 'portal v2 fixture: her satıra öneri üretilir', `bos=${portalV2.rows.filter((r) => r.categories.length === 0).length}`);
const portalV2Find = (needle) => portalV2.rows.find((r) => r.partName.toLocaleUpperCase('tr-TR').includes(needle));
const assertPortalV2Decision = (needle, expected, forbidden, reviewExpected = null) => {
  const row = portalV2Find(needle);
  assert(row && expected.every((cat) => row.categories.includes(cat)), `portal v2 fixture: ${needle} beklenen sınıfa gider`, JSON.stringify(row));
  assert(row && forbidden.every((cat) => !row.categories.includes(cat)), `portal v2 fixture: ${needle} yasak işçilikleri almaz`, JSON.stringify(row));
  if (reviewExpected !== null) assert(row && row.needsReview === reviewExpected, `portal v2 fixture: ${needle} kontrol gerekli=${reviewExpected}`, JSON.stringify(row));
};
assertPortalV2Decision('MOTOR ELEKTRİK TESİSATI', ['Elektrik'], ['Mekanik', 'Kaporta', 'Cam']);
assertPortalV2Decision('MOTOR KAPUTU', ['Kaporta', 'Boya'], ['Mekanik', 'Cam']);
assertPortalV2Decision('GÜNDÜZ SÜRÜŞ FARI', ['Elektrik'], ['Kaporta', 'Mekanik', 'Cam'], true);
assertPortalV2Decision('YAĞ POMPASI', ['Mekanik'], ['Cam', 'Kaporta']);
assertPortalV2Decision('EGR VALFİ', ['Mekanik'], ['Cam', 'Kaporta']);
assertPortalV2Decision('HAVA FİLTRESİ', ['Mekanik'], ['Cam', 'Kaporta']);
assertPortalV2Decision('RADYATÖR PANJURU', ['Kaporta'], ['Mekanik', 'Cam']);
assertPortalV2Decision('ÇAMURLUK DAVLUMBAZI', ['Kaporta'], ['Cam', 'Mekanik'], true);
assertPortalV2Decision('ŞARJ DİNAMOSU', ['Mekanik'], ['Cam', 'Kaporta']);
assertPortalV2Decision('ALTERNATÖR', ['Mekanik'], ['Cam', 'Kaporta']);
assertPortalV2Decision('SİGORTA KUTUSU', ['Elektrik'], ['Kaporta', 'Mekanik', 'Cam']);
assertPortalV2Decision('RADAR SENSÖRÜ', ['Elektrik'], ['Kaporta', 'Mekanik', 'Cam']);
assertPortalV2Decision('ÖN CAM', ['Cam'], ['Mekanik', 'Kaporta']);
const lowConfidencePortalRow = portalV2Find('BİLİNMEYEN');
assert(lowConfidencePortalRow && lowConfidencePortalRow.categories.length > 0 && lowConfidencePortalRow.confidence === 'Düşük' && lowConfidencePortalRow.needsReview, 'portal v2 fixture: düşük güvenli satır boş bırakılmaz ve kontrol gerekli işaretlenir', JSON.stringify(lowConfidencePortalRow));
const portalV2StatAfter = await fs.stat(portalV2Input);
assert(portalV2StatAfter.size === portalV2StatBefore.size && portalV2StatAfter.mtimeMs === portalV2StatBefore.mtimeMs, 'portal v2 fixture: önizleme Excel dosyasını yazmadan okur', 'portal v2 fixture değişti');

// v0.5.0: Ağır Hasar AI Ön Değerlendirme karar motoru ve güvenlik kapıları.
const hdFrontRight = classifyHeavyDamagePart({ name: 'Sağ ön şasi kolu değişim', source: 'manual' });
assert(hdFrontRight.guideCategory === 'front-chassis-right' && hdFrontRight.score === 20 && hdFrontRight.confidence === 'Yüksek', 'ağır hasar: sağ ön şasi kolu değişim 20 puan yüksek güven', JSON.stringify(hdFrontRight));
const hdFirewall = classifyHeavyDamagePart({ name: 'Ön göğüs sacı değişim', source: 'manual' });
assert(hdFirewall.guideCategory === 'firewall' && hdFirewall.score === 40 && hdFirewall.directThreshold === true, 'ağır hasar: ön göğüs sacı değişim doğrudan eşik riski üretir', JSON.stringify(hdFirewall));
const hdUnknownChassis = classifyHeavyDamagePart({ name: 'Ön şasi kolu onarım', source: 'tracking-note' });
assert(hdUnknownChassis.needsReview && hdUnknownChassis.confidence === 'Orta' && hdUnknownChassis.questions.length > 0, 'ağır hasar: yön/derece belirsiz şasi satırı kontrol gerekli olur', JSON.stringify(hdUnknownChassis));
const hdOut = classifyHeavyDamagePart({ name: 'Ön tampon değişim', source: 'manual' });
assert(!hdOut.inScope && hdOut.score === 0 && hdOut.needsReview && hdOut.confidence === 'Düşük', 'ağır hasar: kapsam dışı kaporta parçası puanlanmaz ama inceleme satırı üretir', JSON.stringify(hdOut));

const hdPreview = buildHeavyDamagePreview({
  folderPath: 'C:/case/34ABC123',
  plate: '34ABC123',
  officeFileNo: '2026/99',
  assessedBy: 'Davranış Testi',
  repairCost: 600000,
  marketValue: 1000000,
  now: '2026-06-19T09:00:00.000Z',
  inputs: [
    { name: 'Sağ ön şasi kolu değişim', source: 'manual' },
    { name: 'Tavan sacı değişim', source: 'manual' },
    { name: 'Tavan travers onarım ağır', source: 'manual' }
  ]
});
assert(HEAVY_DAMAGE_THRESHOLD === 35 && hdPreview.summary.totalScore === 35 && hdPreview.summary.thresholdExceeded, 'ağır hasar: 35 puan eşiği toplam skorla aşılır', JSON.stringify(hdPreview.summary));
assert(HEAVY_DAMAGE_ECONOMIC_THRESHOLD === 60 && hdPreview.summary.repairToMarketRatio === 60 && hdPreview.summary.economicThresholdExceeded, 'ağır hasar: %60 ekonomik eşik ayrı hesaplanır', JSON.stringify(hdPreview.summary));
assert(hdPreview.userApproved === false, 'ağır hasar: önizleme kullanıcı onayı olmadan kayıt sayılmaz', JSON.stringify({ userApproved: hdPreview.userApproved }));
assert(hdPreview.summary.aiSummary.includes('35') && hdPreview.summary.warnings.some((warning) => warning.includes('Nihai')), 'ağır hasar: AI özeti nihai karar olmadığını uyarır', JSON.stringify(hdPreview.summary));

const hdEdited = applyHeavyDamageEdits(hdPreview, {
  [hdPreview.rows[2].id]: {
    guideCategory: 'roof-crossmember-unknown',
    damageType: 'repair',
    repairSeverity: 'medium',
    score: 3,
    needsReview: true,
    userNote: 'Eksper orta onarım olarak düzeltti.'
  }
}, 'Eksper fotoğraf kontrolü sonrası onayladı.', '2026-06-19T10:00:00.000Z');
assert(hdEdited.userApproved === true && hdEdited.rows[2].userEdited && hdEdited.rows[2].score === 3 && hdEdited.summary.totalScore === 33, 'ağır hasar: kullanıcı satır düzeltmesi skora ve özete uygulanır', JSON.stringify(hdEdited.rows[2]));
assert(generateHeavyDamageAssessmentNote(hdEdited).includes('Nihai değerlendirme') && generateHeavyDamageAssessmentNote(hdEdited).includes('33'), 'ağır hasar: rapor notu puan ve nihai karar uyarısını içerir', generateHeavyDamageAssessmentNote(hdEdited));
assert(heavyDamageFilterMatches(hdEdited.rows[2], 'review') && heavyDamageFilterMatches(hdEdited.rows[2], 'repair-medium') && !heavyDamageFilterMatches(hdEdited.rows[2], 'repair-heavy'), 'ağır hasar: kontrol ve onarım derece filtreleri çalışır', JSON.stringify(hdEdited.rows[2]));

const pmeFixture = JSON.parse(await fs.readFile(path.join(process.cwd(), 'scripts', 'fixtures', 'heavy-damage-34-pme-968.json'), 'utf-8'));
const pmeInputs = pmeFixture.parts.map((part) => ({
  name: part.name,
  source: 'manual',
  ...(part.note ? { note: part.note } : {}),
  ...(part.operation ? { operation: part.operation } : {}),
  ...(part.structuralConfirmed !== undefined ? { structuralConfirmed: part.structuralConfirmed } : {})
}));
const pmePreview = buildHeavyDamagePreview({
  folderPath: 'C:/case/34PME968',
  plate: pmeFixture.plate,
  officeFileNo: pmeFixture.dosyaNo,
  assessedBy: 'Davranış Testi',
  repairCost: pmeFixture.totalDamageWithVat,
  marketValue: pmeFixture.marketValue,
  now: '2026-06-19T11:00:00.000Z',
  inputs: pmeInputs
});
const pmeFirewall = pmePreview.rows.find((row) => row.sourcePartName === 'Ön Göğüs');
assert(pmePreview.summary.repairToMarketRatio === pmeFixture.expectedRepairToMarketRatio && !pmePreview.summary.economicThresholdExceeded, '34 PME 968 fixture: ekonomik oran yaklaşık %52 ve %60 eşik aşılmadı', JSON.stringify(pmePreview.summary));
assert(pmeFirewall && pmeFirewall.guideCategory === 'firewall' && pmeFirewall.structuralConfirmed === true && pmeFirewall.score === 40 && !pmeFirewall.needsReview, '34 PME 968 fixture: yapısal teyitli Ön Göğüs firewall olarak 40 puan verir', JSON.stringify(pmeFirewall));
assert(pmePreview.summary.thresholdExceeded && pmePreview.summary.totalScore >= 40 && pmePreview.summary.riskLabel.includes('aşıldı'), '34 PME 968 fixture: ekonomik eşik aşılmasa da yapısal eşik ağır hasar riskini açar', JSON.stringify(pmePreview.summary));
assert(pmePreview.summary.warnings.some((warning) => warning.includes('Ekonomik %60 eşik aşılmadı ancak yapısal kritik parça eşiği aşıldı')), '34 PME 968 fixture: ekonomik/yapısal eşik ayrımı gerekçede açık yazılır', JSON.stringify(pmePreview.summary.warnings));
const pmeAirbagRows = pmePreview.rows.filter((row) => row.guideCategory === 'airbag-seatbelt');
const pmeElectricRows = pmePreview.rows.filter((row) => row.guideCategory === 'main-electrical');
const pmeRawScore = pmePreview.rows.reduce((sum, row) => sum + (row.inScope ? row.score : 0), 0);
assert(pmeAirbagRows.length > 3 && pmeElectricRows.length >= 3 && pmePreview.summary.groupedScoreAdjustments >= 2 && pmeRawScore > pmePreview.summary.totalScore, '34 PME 968 fixture: airbag/emniyet ve elektrik kalemleri mükerrer puanı şişirmez', JSON.stringify({ raw: pmeRawScore, summary: pmePreview.summary.totalScore, grouped: pmePreview.summary.groupedScoreAdjustments }));
const pmeTravers = pmePreview.rows.find((row) => row.sourcePartName === 'Ön Travers');
const pmeSteering = pmePreview.rows.find((row) => row.sourcePartName === 'Direksiyon Mili');
assert(pmeTravers && pmeTravers.score === 0 && pmeTravers.needsReview && !pmeTravers.inScope, '34 PME 968 fixture: Ön Travers otomatik puan uydurmaz, kontrol gerekli kalır', JSON.stringify(pmeTravers));
assert(pmeSteering && pmeSteering.score === 0 && pmeSteering.needsReview && !pmeSteering.inScope, '34 PME 968 fixture: Direksiyon Mili tek başına puan uydurmaz, destekleyici kontrol kalır', JSON.stringify(pmeSteering));
const pmeUnconfirmed = buildHeavyDamagePreview({
  folderPath: 'C:/case/front-panel-review',
  plate: '34PME968',
  officeFileNo: '49/18303851',
  assessedBy: 'Davranış Testi',
  inputs: [{ name: 'Ön Göğüs', source: 'manual', operation: 'replacement', structuralConfirmed: false }]
});
assert(pmeUnconfirmed.rows[0].score === 0 && pmeUnconfirmed.rows[0].needsReview && pmeUnconfirmed.rows[0].questions.some((q) => q.includes('torpido/plastik')), 'Ön Göğüs teyitsizse 40 puan verilmez ve torpido/firewall sorusu sorulur', JSON.stringify(pmeUnconfirmed.rows[0]));
const pmeConfirmedByUser = applyHeavyDamageEdits(pmeUnconfirmed, { [pmeUnconfirmed.rows[0].id]: { structuralConfirmed: true } });
assert(pmeConfirmedByUser.rows[0].score === 40 && !pmeConfirmedByUser.rows[0].needsReview && pmeConfirmedByUser.summary.thresholdExceeded, 'Ön Göğüs UI/eksper teyidiyle firewall 40 puana geçer', JSON.stringify(pmeConfirmedByUser.rows[0]));
const pmeNote = generateHeavyDamageAssessmentNote(pmePreview);
assert(pmeNote.includes('34 PME 968') && pmeNote.includes('Ön Göğüs') && pmeNote.includes('40 puan') && pmeNote.includes('Nihai değerlendirme'), '34 PME 968 fixture: resmi rapor notu plaka, Ön Göğüs 40 puan ve nihai karar uyarısını içerir', pmeNote);
const pmeMail = generateHeavyDamageAssessmentMailDraft(pmePreview);
assert(pmeMail.includes('49/18303851') && pmeMail.includes('34 PME 968') && pmeMail.includes('%52') && pmeMail.includes('40 puan') && pmeMail.includes('görüş/onay'), '34 PME 968 fixture: kurumsal mail taslağı dosya no, plaka, oran, 40 puan ve onay talebini içerir', pmeMail);

const heavyDamageRulesSource = await fs.readFile('src/shared/heavy-damage-rules.ts', 'utf-8');
const heavyDamageTypesSource = await fs.readFile('src/shared/heavy-damage-types.ts', 'utf-8');
const heavyDamageServiceSource = await fs.readFile('src/main/services/heavy-damage-assessment-service.ts', 'utf-8');
const heavyDamageComponentSource = await fs.readFile('src/renderer/app/components/heavy-damage-assessment.ts', 'utf-8');
const heavyDamageTrackingSchemaSource = await fs.readFile('src/main/tracking/tracking-schema.ts', 'utf-8');
const heavyDamageRendererMainSource = await fs.readFile('src/renderer/main.ts', 'utf-8');
const heavyDamageIpcContractSource = await fs.readFile('src/shared/ipc-contract.ts', 'utf-8');
const heavyDamageMainIpcSource = await fs.readFile('src/main/ipc.ts', 'utf-8');
const heavyDamagePreloadSource = await fs.readFile('src/preload/preload.ts', 'utf-8');
assert(heavyDamageRulesSource.includes('HEAVY_DAMAGE_THRESHOLD = 35') && heavyDamageRulesSource.includes('HEAVY_DAMAGE_ECONOMIC_THRESHOLD = 60'), 'ağır hasar: 35 puan ve %60 ekonomik eşik sabitleri kaynakta korunur', 'eşik sabitleri eksik');
assert(heavyDamageRulesSource.includes('Ön Göğüs Sacı') && heavyDamageRulesSource.includes('Motosiklet Ana') && heavyDamageRulesSource.includes('Traktör Blok'), 'ağır hasar: rehberde doğrudan riskli yapısal/araç tipleri var', 'rehber kuralı eksik');
assert(heavyDamageRulesSource.includes('isUnconfirmedFrontPanel') && heavyDamageRulesSource.includes('structuralConfirmed') && heavyDamageRulesSource.includes('groupedScoreAdjustments'), 'ağır hasar: Ön Göğüs yapısal teyidi ve grup mükerrer puan koruması kaynakta var', 'structural/group guard eksik');
assert(heavyDamageRulesSource.includes('generateHeavyDamageAssessmentMailDraft') && heavyDamageRulesSource.includes('Ekonomik eşik aşılmamakla birlikte yapısal kritik parça eşiği'), 'ağır hasar: rapor/mail metni ekonomik ve yapısal eşik ayrımını anlatır', 'rapor/mail eşik ayrımı eksik');
assert(heavyDamageTypesSource.includes("HeavyDamageSource = 'manual'") && heavyDamageTypesSource.includes('userApproved') && heavyDamageTypesSource.includes('HeavyDamageRowEdit'), 'ağır hasar: manuel kaynak, kullanıcı onayı ve satır düzeltme tipleri tanımlı', 'tip sözleşmesi eksik');
assert(heavyDamageServiceSource.includes('userConfirmed !== true') && heavyDamageServiceSource.includes('Kullanıcı son onayı olmadan') && heavyDamageServiceSource.includes('tracking.heavyDamageAssessment = record'), 'ağır hasar: main servis son onay olmadan takip.json içine yazmaz', 'son onay guard eksik');
assert(heavyDamageComponentSource.includes('data-action="heavy-damage-preview"') && heavyDamageComponentSource.includes('data-action="heavy-damage-save-confirm"') && heavyDamageComponentSource.includes('Kaydetmeden Önce Son Kontrol'), 'ağır hasar: UI önizleme ve son onay modalı sunar', 'heavy damage UI eksik');
assert(heavyDamageComponentSource.includes('data-heavy-row-score') && heavyDamageComponentSource.includes('data-heavy-row-review') && heavyDamageComponentSource.includes('data-heavy-row-structural') && heavyDamageComponentSource.includes('Mail taslağı'), 'ağır hasar: UI satır düzeltme, yapısal teyit ve mail taslağı alanlarını sunar', 'satır düzeltme/structural/mail alanı eksik');
assert(heavyDamageRendererMainSource.includes("case 'heavy-damage-save': openHeavyDamageConfirm()") && heavyDamageRendererMainSource.includes("case 'heavy-damage-save-confirm'") && heavyDamageRendererMainSource.includes('!state.heavyDamageConfirmOpen') && heavyDamageRendererMainSource.includes('userConfirmed: true') && heavyDamageRendererMainSource.includes('heavyRowStructural'), 'ağır hasar: renderer son onay olmadan kayıt IPC çağırmaz ve yapısal teyidi işler', 'renderer kayıt/structural kapısı eksik');
assert(heavyDamageIpcContractSource.includes('heavyDamagePreview') && heavyDamageIpcContractSource.includes('heavy-damage:save') && heavyDamageMainIpcSource.includes('IPC.heavyDamageSave') && heavyDamagePreloadSource.includes('heavyDamageSave'), 'ağır hasar: IPC contract/main/preload bağlantıları var', 'IPC bağlantısı eksik');
assert(heavyDamageTrackingSchemaSource.includes('normalizeOptionalHeavyDamageAssessment') && heavyDamageTrackingSchemaSource.includes('heavyDamageAssessment'), 'ağır hasar: eski takip.json uyumluluğu için opsiyonel assessment normalize edilir', 'tracking schema uyumluluğu eksik');

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
const rendererMainSource = await fs.readFile('src/renderer/main.ts', 'utf-8');
const rendererStateSource = await fs.readFile('src/renderer/app/state.ts', 'utf-8');
const rendererStylesSource = await fs.readFile('src/renderer/styles.css', 'utf-8');
const autoLaborVmSource = await fs.readFile('src/shared/auto-labor-view-model.ts', 'utf-8');
const settingsSource = await fs.readFile('src/renderer/app/components/settings.ts', 'utf-8');
const ipcContractSource = await fs.readFile('src/shared/ipc-contract.ts', 'utf-8');
const mainIpcSource = await fs.readFile('src/main/ipc.ts', 'utf-8');
const preloadSource = await fs.readFile('src/preload/preload.ts', 'utf-8');
const learningAdminSource = await fs.readFile('src/main/services/labor-learning-admin-service.ts', 'utf-8');
// v0.4.1: Bağımsız "Risk Kontrolü" sekmesi "Sorunlar / Risk" sayfasına taşındı; risk etiketi
// artık detail.ts içindeki Risk Kontrol Özeti'nde yaşar. Yapay Zekâ yasağı aşağıda korunur.
assert(detailSource.includes('Risk Kontrol'), 'Yapay Zekâ etiketi Risk Kontrol olarak değiştirildi', 'Risk Kontrol etiketi yok');
assert(!detailSource.includes('Yapay Zekâ') && !layoutSource.includes('Yapay Zekâ'), 'Uygulama ana UI içinde yanıltıcı Yapay Zekâ etiketi kalmadı', 'Yapay Zekâ etiketi hâlâ var');
assert(ipcDomainSource.includes('sanitizeNoteText') && !ipcDomainSource.includes('const text = safeFileDisplayName(args.text.trim())'), 'Not metni dosya adı temizleyiciyle 180 karaktere kırpılmaz', 'Not akışı safeFileDisplayName ile kırpılıyor');
assert(detailSource.includes('data-action="auto-labor-filter"') && detailSource.includes('Gösterilen:') && autoLaborVmSource.includes("medium: 'Orta güven'") && autoLaborVmSource.includes("low: 'Düşük güven'") && autoLaborVmSource.includes("oldCleared: 'Eski değer sıfırlanacak'") && autoLaborVmSource.includes("learning: 'Öğrenmeye aday'"), 'v0.5.0 AI işçilik önizlemesi tüm kritik filtreleri sunar', 'AI işçilik filtre UI eksik');
assert(detailSource.includes('id="auto-labor-search"') && autoLaborVmSource.includes('autoLaborSearchMatches') && rendererMainSource.includes("target.id === 'auto-labor-search'"), 'v0.5.0 AI işçilik önizleme araması parça/grup/kod/işçilik/gerekçeyi süzer', 'AI işçilik arama akışı eksik');
assert(rendererStateSource.includes('autoLaborFilter') && rendererStateSource.includes('autoLaborSearch') && rendererMainSource.includes("case 'auto-labor-filter'") && rendererMainSource.includes("state.autoLaborFilter = 'all'"), 'v0.5.0 AI işçilik filtre/arama state bağlantısı ve sıfırlama akışı var', 'AI işçilik filtre state/renderer bağlantısı eksik');
assert(rendererStateSource.includes('autoLaborPage') && detailSource.includes('buildAutoLaborPageModel') && detailSource.includes('auto-labor-pagination') && rendererMainSource.includes("case 'auto-labor-page'") && rendererMainSource.includes('setAutoLaborPage') && rendererMainSource.includes('queueAutoLaborSearchUpdate') && rendererStylesSource.includes('.auto-labor-pagination'), 'v0.5.0 AI işçilik büyük Excel önizlemesi sayfalama, tek-pass sayfa modeli ve arama debounce ile korunur', 'AI işçilik büyük Excel sayfalama/page-model guard eksik');
assert(detailSource.includes('auto-labor-summary-card') && detailSource.includes('Toplam satır') && detailSource.includes('Sıfırlanacak H-N') && rendererStylesSource.includes('.auto-labor-summary-cards'), 'v0.5.0 AI işçilik üst özet kartları tıklanabilir filtre olarak render edilir', 'AI işçilik özet kartları eksik');
assert(rendererMainSource.includes("case 'auto-labor-save': openAutoLaborConfirm()") && rendererMainSource.includes("case 'auto-labor-save-confirm'") && rendererMainSource.includes('if (!state.autoLaborConfirmOpen)') && detailSource.includes('Kaydetmeden önce son kontrol'), 'v0.5.0 AI işçilik son onay modalı olmadan Excel yazmaz', 'AI işçilik son onay kapısı eksik');
assert(detailSource.includes('auto-labor-confirm-card') && detailSource.includes('Geri dön ve düzenle') && detailSource.includes('Formüllü hücreler tespit edildi') && rendererMainSource.includes('preview.formulaCellsFound > 0 && !state.autoLaborAllowFormula'), 'v0.5.0 AI işçilik formül uyarısı son onay modalında ve yazma kapısında korunur', 'AI işçilik formül modal/guard eksik');
assert(autoLaborVmSource.includes('autoLaborHasUserEdit') && autoLaborVmSource.includes('Kullanıcı tarafından düzeltildi') && autoLaborVmSource.includes('Öğrenmeye kaydedilecek') && rendererMainSource.includes('autoLaborReviewRows'), 'v0.5.0 AI işçilik kullanıcı düzeltmesi, kontrol gerekli ve öğrenme adayı state akışı var', 'AI işçilik düzeltme/öğrenme state akışı eksik');
assert(detailSource.includes('renderAutoLaborResult') && detailSource.includes('Kullanıcı düzeltmesi') && detailSource.includes('Sıfırlanan eski H-N') && detailSource.includes('Kısmi yazma') && detailSource.includes('renderCategoryTotals') && rendererStylesSource.includes('.auto-labor-result-grid'), 'v0.5.0 AI işçilik kaydetme sonucu kategori toplamları, kullanıcı düzeltmesi ve kısmi yazma durumuyla raporlanır', 'AI işçilik sonuç raporu grid/kısmi yazma kontrolü eksik');
assert(rendererMainSource.includes('state.autoLaborSaveError') && detailSource.includes('Excel kaydedilemedi.') && rendererMainSource.includes('Başarı onayı alınmadı; çıktı dosyası oluştuysa kullanmadan önce kontrol edin.') && rendererMainSource.includes("setToast('Excel kaydedilemedi. Orijinal dosya korunuyor.', 'warning')") && rendererMainSource.includes('setToast(`Excel başarıyla kaydedildi:'), 'v0.5.0 AI işçilik hata durumunda başarılı kayıt mesajı göstermez ve kısmi yazma şüphesini raporlar', 'AI işçilik hata/kısmi yazma raporu eksik');
assert(rendererStylesSource.includes('.auto-labor-filter-bar') && rendererStylesSource.includes('.auto-labor-filter-button.active') && rendererStylesSource.includes('.auto-labor-confirm-grid'), 'v0.5.0 AI işçilik filtreleri ve son onay modalı kompakt UI stiliyle korunur', 'AI işçilik filtre/modal CSS eksik');

assert(detailSource.includes('data-default-closed="true"') && detailSource.includes('<summary>Gerek') && !detailSource.includes('auto-labor-reason" open') && rendererStylesSource.includes('.auto-labor-reason:not([open]) small') && rendererStylesSource.includes('.auto-labor-reason[open] small'), 'v0.5.0 AI iscilik uzun gerekce alanlari varsayilan kapali ve kompakt render edilir', 'AI iscilik gerekce alani kapali/kompakt guard eksik');
assert(autoLaborVmSource.includes('AUTO_LABOR_PAGE_SIZE_OPTIONS') && autoLaborVmSource.includes('[25, 50, 100]') && detailSource.includes('data-auto-labor-page-size') && rendererMainSource.includes('setAutoLaborPageSize') && rendererStylesSource.includes('.auto-labor-page-size'), 'v0.5.0 AI iscilik sayfa basina 25/50/100 satir secimi korunur', 'AI iscilik sayfa boyutu secimi eksik');
assert(settingsSource.includes('AI İşçilik Öğrenme Sözlüğü') && settingsSource.includes('labor-learning-search') && settingsSource.includes('labor-learning-update') && settingsSource.includes('labor-learning-import') && rendererStylesSource.includes('.labor-learning-card'), 'v0.5.0 AI iscilik ogrenme sozlugu Ayarlar icinde yonetilebilir UI sunar', 'AI iscilik ogrenme sozlugu UI eksik');
assert(ipcContractSource.includes('laborLearningList') && ipcContractSource.includes('labor-learning:list') && mainIpcSource.includes('IPC.laborLearningUpdate') && preloadSource.includes('laborLearningImport') && learningAdminSource.includes('importLaborLearningJson'), 'v0.5.0 AI iscilik ogrenme sozlugu IPC/import-export servisi bagli', 'AI iscilik ogrenme sozlugu IPC/servis baglantisi eksik');

const autoLaborPreviewFixture = {
  filePath: 'fixture.xlsx',
  fileName: 'fixture.xlsx',
  sheetName: 'Portal',
  columns: [
    { column: 'H', category: 'Kaporta', header: 'Kaporta' },
    { column: 'I', category: 'Mekanik', header: 'Mekanik' },
    { column: 'J', category: 'Elektrik', header: 'Elektrik' },
    { column: 'K', category: 'Döşeme/Kilit', header: 'Döşeme-Kilit' },
    { column: 'L', category: 'Cam', header: 'Cam' },
    { column: 'M', category: 'Boya', header: 'Boya' },
    { column: 'N', category: 'Onarım', header: 'Onarım' }
  ],
  partNameColumn: 'C',
  groupColumn: 'B',
  partCodeColumn: 'D',
  partAmountColumn: 'F',
  rows: [
    { rowNumber: 2, partName: 'SOL FAR', group: 'AYDINLATMA', partCode: 'ELK-1', partAmount: 1000, categories: ['Elektrik'], amounts: { Elektrik: 1000 }, oldByColumn: { H: 400, I: 0, J: 0, K: 0, L: 0, M: 0, N: 0 }, confidence: 'Orta', needsReview: true, reason: 'Kanıt: far.', source: 'rules', hasFormula: true, changed: true },
    { rowNumber: 3, partName: 'ALTERNATÖR', group: 'MEKANIK', partCode: 'MEK-1', partAmount: 1500, categories: ['Mekanik'], amounts: { Mekanik: 1500 }, oldByColumn: { H: 0, I: 0, J: 0, K: 0, L: 888, M: 0, N: 0 }, confidence: 'Yüksek', needsReview: false, reason: 'Kanıt: alternatör.', source: 'rules', hasFormula: false, changed: true },
    { rowNumber: 4, partName: 'BİLİNMEYEN PARÇA', group: 'GENEL', partCode: 'UNK-1', partAmount: 500, categories: ['Onarım'], amounts: { Onarım: 500 }, oldByColumn: { H: 0, I: 0, J: 0, K: 0, L: 0, M: 0, N: 0 }, confidence: 'Düşük', needsReview: true, reason: 'Varsayılan Onarım.', source: 'fallback', hasFormula: false, changed: false }
  ],
  summary: { processed: 3, highConfidence: 1, needsReview: 2, changedRows: 2, totalsByCategory: { Elektrik: 1000, Mekanik: 1500, Onarım: 500 } },
  warnings: [],
  formulaCellsFound: 1
};
const autoLaborUiState = {
  autoLaborEdits: { 3: { Mekanik: 0, Kaporta: 1250 } },
  autoLaborApprovedRows: { 4: true },
  autoLaborReviewRows: { 2: false, 3: true },
  autoLaborSearch: '',
  autoLaborFilter: 'all'
};
const autoStats = buildAutoLaborStats(autoLaborPreviewFixture, autoLaborUiState);
assert(autoStats.totalRows === 3 && autoStats.rowsToWrite === 3, 'v0.5.0 AI işçilik view-model tüm yazılacak satırları sayar', JSON.stringify(autoStats));
assert(autoStats.changedRows === 2 && autoStats.reviewRows === 2 && autoStats.highConfidenceRows === 1 && autoStats.mediumConfidenceRows === 1 && autoStats.lowConfidenceRows === 1, 'v0.5.0 AI işçilik view-model değişen/kontrol/güven sayılarını hesaplar', JSON.stringify(autoStats));
assert(autoStats.oldClearedCells === 2 && autoStats.userEditedRows === 1 && autoStats.learningCandidateRows === 2 && autoStats.formulaRows === 1, 'v0.5.0 AI işçilik view-model eski H-N, düzeltme, öğrenme ve formül sayılarını hesaplar', JSON.stringify(autoStats));
assert(autoStats.categoryTotals.Kaporta === 1250 && autoStats.categoryTotals.Elektrik === 1000 && !autoStats.categoryTotals.Mekanik, 'v0.5.0 AI işçilik kullanıcı düzeltmesi kategori toplamlarına uygulanır', JSON.stringify(autoStats.categoryTotals));
const autoPageModel = buildAutoLaborPageModel(autoLaborUiState, autoLaborPreviewFixture, 1);
assert(AUTO_LABOR_ROWS_PER_PAGE > 0 && AUTO_LABOR_ROWS_PER_PAGE <= 60 && autoPageModel.filterCounts.all === 3 && autoPageModel.filterCounts.high === 1 && autoPageModel.filterCounts.review === 2 && autoPageModel.filterCounts.learning === 2, 'v0.5.0 AI işçilik büyük Excel guard filtre sayılarını tam veri üstünden hesaplar', JSON.stringify(autoPageModel.filterCounts));
assert(autoPageModel.visibleRows.length === 3 && autoPageModel.totalFilteredRows === 3 && autoPageModel.totalPages === 1, 'v0.5.0 AI işçilik page model sadece görünür sayfa satırlarını döndürür', JSON.stringify({ visible: autoPageModel.visibleRows.length, total: autoPageModel.totalFilteredRows, pages: autoPageModel.totalPages }));
assert(AUTO_LABOR_DEFAULT_PAGE_SIZE === 50 && AUTO_LABOR_PAGE_SIZE_OPTIONS.join(',') === '25,50,100' && normalizeAutoLaborPageSize(25) === 25 && normalizeAutoLaborPageSize(100) === 100 && normalizeAutoLaborPageSize(999) === AUTO_LABOR_DEFAULT_PAGE_SIZE, 'v0.5.0 AI iscilik sayfa boyutu 25/50/100 ve guvenli varsayilan kullanir', JSON.stringify({ options: AUTO_LABOR_PAGE_SIZE_OPTIONS, defaultSize: AUTO_LABOR_DEFAULT_PAGE_SIZE }));

const largeAutoPreviewFixture = {
  ...autoLaborPreviewFixture,
  rows: Array.from({ length: AUTO_LABOR_ROWS_PER_PAGE + 7 }, (_unused, index) => ({
    ...autoLaborPreviewFixture.rows[0],
    rowNumber: index + 2,
    partName: `SOL FAR ${index + 1}`,
    oldByColumn: { H: 0, I: 0, J: 0, K: 0, L: 0, M: 0, N: 0 }
  })),
  summary: { ...autoLaborPreviewFixture.summary, processed: AUTO_LABOR_ROWS_PER_PAGE + 7 }
};
const largeAutoState = { ...autoLaborUiState, autoLaborEdits: {}, autoLaborApprovedRows: {}, autoLaborReviewRows: {}, autoLaborSearch: '', autoLaborFilter: 'all' };
const largeFirstPage = buildAutoLaborPageModel(largeAutoState, largeAutoPreviewFixture, 1);
const largeSecondPage = buildAutoLaborPageModel(largeAutoState, largeAutoPreviewFixture, 2);
assert(largeFirstPage.totalFilteredRows === AUTO_LABOR_ROWS_PER_PAGE + 7 && largeFirstPage.visibleRows.length === AUTO_LABOR_ROWS_PER_PAGE && largeSecondPage.visibleRows.length === 7, 'v0.5.0 AI işçilik büyük tabloda DOM satırlarını aktif sayfayla sınırlar', JSON.stringify({ first: largeFirstPage.visibleRows.length, second: largeSecondPage.visibleRows.length, total: largeFirstPage.totalFilteredRows }));
const autoSavePlan = buildAutoLaborSavePlan(autoLaborPreviewFixture, autoLaborUiState);
assert(autoSavePlan.rows.length === 3 && autoSavePlan.corrections.length === 2, 'v0.5.0 AI işçilik save planı kullanıcı düzeltmesi/onayını öğrenmeye aday yapar', JSON.stringify(autoSavePlan));
assert(autoSavePlan.rows.find((row) => row.rowNumber === 3)?.amounts.Kaporta === 1250 && !autoSavePlan.rows.find((row) => row.rowNumber === 3)?.amounts.Mekanik, 'v0.5.0 AI işçilik kullanıcı düzeltmesi kaydetme planına uygulanır', JSON.stringify(autoSavePlan.rows));
assert(autoLaborFilterMatches(autoLaborUiState, autoLaborPreviewFixture, autoLaborPreviewFixture.rows[1], 'high'), 'v0.5.0 AI işçilik yüksek güven filtresi kontrol işaretinden bağımsız çalışır', JSON.stringify(autoLaborPreviewFixture.rows[1]));
assert(autoLaborFilterMatches(autoLaborUiState, autoLaborPreviewFixture, autoLaborPreviewFixture.rows[1], 'oldCleared') && autoLaborFilterMatches(autoLaborUiState, autoLaborPreviewFixture, autoLaborPreviewFixture.rows[2], 'learning'), 'v0.5.0 AI işçilik eski değer ve öğrenme filtreleri gerçek satırı yakalar', JSON.stringify({ oldCleared: autoLaborPreviewFixture.rows[1], learning: autoLaborPreviewFixture.rows[2] }));
assert(autoLaborFilterMatches(autoLaborUiState, autoLaborPreviewFixture, autoLaborPreviewFixture.rows[0], 'medium') && autoLaborFilterMatches(autoLaborUiState, autoLaborPreviewFixture, autoLaborPreviewFixture.rows[2], 'low') && autoLaborFilterMatches(autoLaborUiState, autoLaborPreviewFixture, autoLaborPreviewFixture.rows[2], 'review') && autoLaborFilterMatches(autoLaborUiState, autoLaborPreviewFixture, autoLaborPreviewFixture.rows[0], 'changed'), 'v0.5.0 AI iscilik kontrol/degisen/orta/dusuk filtreleri calisir', JSON.stringify(autoPageModel.filterCounts));
assert(!autoLaborFilterMatches(autoLaborUiState, autoLaborPreviewFixture, autoLaborPreviewFixture.rows[0], 'learning'), 'v0.5.0 AI iscilik mevcut H-N degerlerini otomatik ogrenmeye aday yapmaz', JSON.stringify(autoLaborPreviewFixture.rows[0]));
const searchState = { ...autoLaborUiState, autoLaborSearch: 'far' };
assert(autoLaborSearchMatches(searchState, autoLaborPreviewFixture.rows[0]) && !autoLaborSearchMatches(searchState, autoLaborPreviewFixture.rows[1]), 'v0.5.0 AI işçilik araması parça açıklamasında çalışır', JSON.stringify({ far: autoLaborPreviewFixture.rows[0].partName, other: autoLaborPreviewFixture.rows[1].partName }));


// RC5: Per-case cache orphan dosyaları silinmiş/taşınmış dosyaları ghost case olarak geri getirmemeli.
const hugeAutoPreviewFixture = {
  ...autoLaborPreviewFixture,
  rows: Array.from({ length: 257 }, (_unused, index) => ({
    ...autoLaborPreviewFixture.rows[index % autoLaborPreviewFixture.rows.length],
    rowNumber: index + 10,
    partName: index % 3 === 0 ? `SOL FAR BUYUK ${index + 1}` : index % 3 === 1 ? `ALTERNATOR BUYUK ${index + 1}` : `BILINMEYEN BUYUK ${index + 1}`,
    partCode: `BIG-${index + 1}`,
    oldByColumn: { H: 0, I: 0, J: 0, K: 0, L: 0, M: 0, N: 0 }
  })),
  summary: { ...autoLaborPreviewFixture.summary, processed: 257 }
};
const hugeState = { ...autoLaborUiState, autoLaborEdits: { 230: { Elektrik: 0, Mekanik: 777 } }, autoLaborApprovedRows: { 230: true }, autoLaborReviewRows: {}, autoLaborSearch: '', autoLaborFilter: 'all' };
const hugeFirst25 = buildAutoLaborPageModel(hugeState, hugeAutoPreviewFixture, 1, 25);
const hugeLast25 = buildAutoLaborPageModel(hugeState, hugeAutoPreviewFixture, 11, 25);
const hugeFirst100 = buildAutoLaborPageModel(hugeState, hugeAutoPreviewFixture, 1, 100);
assert(hugeFirst25.totalFilteredRows === 257 && hugeFirst25.visibleRows.length === 25 && hugeLast25.visibleRows.length === 7 && hugeFirst100.visibleRows.length === 100 && hugeFirst100.totalPages === 3, 'v0.5.0 AI iscilik 250+ satirda sadece aktif sayfa satirlarini render modeline alir', JSON.stringify({ first25: hugeFirst25.visibleRows.length, last25: hugeLast25.visibleRows.length, first100: hugeFirst100.visibleRows.length, pages100: hugeFirst100.totalPages }));
const hugeSearchState = { ...hugeState, autoLaborSearch: 'BIG-257', autoLaborFilter: 'all' };
const hugeSearchPage = buildAutoLaborPageModel(hugeSearchState, hugeAutoPreviewFixture, 1, 25);
assert(hugeSearchPage.totalFilteredRows === 1 && hugeSearchPage.visibleRows[0]?.partCode === 'BIG-257', 'v0.5.0 AI iscilik buyuk veride arama sonucu dogru satira daralir', JSON.stringify(hugeSearchPage.visibleRows));
const hugeLearningState = { ...hugeState, autoLaborFilter: 'learning' };
const hugeLearningPage = buildAutoLaborPageModel(hugeLearningState, hugeAutoPreviewFixture, 1, 25);
const hugeSavePlan = buildAutoLaborSavePlan(hugeAutoPreviewFixture, hugeLearningState);
assert(hugeLearningPage.totalFilteredRows === 1 && hugeLearningPage.visibleRows[0]?.rowNumber === 230 && hugeSavePlan.rows.length === 257 && hugeSavePlan.stats.totalRows === 257 && hugeSavePlan.rows.find((row) => row.rowNumber === 230)?.amounts.Mekanik === 777, 'v0.5.0 AI iscilik sayfa/filtre degisince kullanici duzeltmesini kaybetmez ve kaydetme tum satirlari kapsar', JSON.stringify({ learningRows: hugeLearningPage.totalFilteredRows, planRows: hugeSavePlan.rows.length, editedRow: hugeSavePlan.rows.find((row) => row.rowNumber === 230) }));

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
