import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const DEFAULT_DEMO_ROOT = 'C:\\HasarBotu-UI-Demo';
const args = parseArgs(process.argv.slice(2));
const demoRoot = path.resolve(args.root ?? DEFAULT_DEMO_ROOT);
const markerPath = path.join(demoRoot, '.hasarbotu-ui-demo.json');
const force = args.force !== false;

const tr = {
  low: 'D\u00fc\u015f\u00fck',
  high: 'Y\u00fcksek',
  closed: 'Kapal\u0131',
  reviewing: '\u0130ncelemede',
  missingDoc: 'Eksik Evrak',
  missingPhoto: 'Eksik Foto\u011fraf',
  portalWaiting: 'Portal Bekliyor',
  partWaiting: 'Par\u00e7a Bekliyor',
  expertWaiting: 'Uzman Onay\u0131 Bekliyor',
  repair: 'Onar\u0131mda',
  closing: 'Kapan\u0131\u015fta',
  newFile: 'Yeni Dosya',
  docWaiting: 'Evrak Bekleniyor',
  photoWaiting: 'Foto\u011fraf Bekleniyor',
  portalControl: 'Portal Kontrol',
  partListWaiting: 'Par\u00e7a Listesi Bekleniyor',
  partCodeWaiting: 'Par\u00e7a Kodu Bekleniyor',
  preReport: '\u00d6n Rapor',
  expertApproval: 'Uzman Onay\u0131 Bekleniyor',
  closingControl: 'Kapan\u0131\u015f Kontrol\u00fc'
};

await assertSafeDemoRoot(demoRoot);
await prepareRoot(demoRoot, markerPath, force);

const yearRoot = path.join(demoRoot, '2026');
const emptyRoot = path.join(yearRoot, '00 BOS');
const fewRoot = path.join(yearRoot, '05 MAYIS');
const normalRoot = path.join(yearRoot, '06 HAZIRAN');
const closedRoot = path.join(normalRoot, 'KAPALI HAZIRAN 2026');

for (const dir of [emptyRoot, fewRoot, normalRoot, closedRoot]) {
  await fs.mkdir(dir, { recursive: true });
}

const fewCases = [
  caseDef('34 FEA 101', '2026/20101', '21-700101', 'Demo Servis A', 'Demo Mehmet', tr.high, tr.docWaiting, tr.missingDoc, { missingDocs: true, notes: true }),
  caseDef('06 FEA 202', '2026/20102', '21-700102', 'Demo Servis B', 'Demo Ayse', 'Normal', tr.portalControl, tr.portalWaiting, { portalPending: true }),
  caseDef('35 FEA 303', '2026/20103', '21-700103', 'Demo Servis C', 'Demo Baran', tr.low, tr.closed, tr.closed, { closed: true, clean: true })
];

const specialCases = [
  caseDef('34 ABC 123', '2026/10452', '13-17947703', 'Avrupa Servis', 'Demo Mehmet', tr.high, tr.docWaiting, tr.missingDoc, {
    missingDocs: true,
    missingPhotos: true,
    unsupported: true,
    conflict: true,
    portalPending: true,
    rucu: true,
    notes: true,
    tasks: true,
    followup: '2026-06-15'
  }),
  caseDef('06 XYZ 987', '2026/10450', '13-17947704', 'Ankara Servis', 'Demo Ayse', 'Normal', tr.portalControl, tr.portalWaiting, {
    portalPending: true,
    notes: true,
    tasks: true,
    followup: '2026-06-16'
  }),
  caseDef('07 ANT 07', '2026/10445', '13-17947705', 'Akdeniz Servis', 'Demo Mehmet', 'Normal', tr.photoWaiting, tr.missingPhoto, {
    missingPhotos: true,
    tasks: true
  }),
  caseDef('16 RAW 016', '2026/10444', '13-17947706', 'Marmara Servis', 'Demo Berfin', tr.high, tr.photoWaiting, tr.missingPhoto, {
    unsupported: true,
    notes: true
  }),
  caseDef('34 KSK 034', '2026/10443', '13-17947707', 'Kasko Servis', 'Demo Enes', 'Normal', tr.preReport, tr.reviewing, {
    claimType: 'kasko',
    clean: true,
    notes: true
  }),
  caseDef('35 DEF 456', '2026/10448', '13-17947708', 'Izmir Servis', 'Demo Sistem', tr.low, tr.closed, tr.closed, {
    closed: true,
    clean: true
  })
];

const generatedCases = [];
const plates = [
  '01 ADA 110', '02 BYN 220', '03 CLK 330', '04 DMR 440', '05 EGE 550',
  '08 ARK 808', '09 AYD 909', '10 BAL 010', '11 BLC 111', '12 BNG 212',
  '14 BOL 314', '15 BRD 415', '17 CKL 617', '18 CNR 718', '19 CRM 819',
  '20 DNZ 020', '21 DIY 121', '22 EDR 222', '23 ELA 323', '24 ERZ 424',
  '25 ERZ 525', '26 ESK 626', '27 GAZ 727', '28 GRS 828', '29 GMH 929',
  '30 HKR 130', '31 HTY 231', '32 ISP 332', '33 ICL 433', '36 KRS 636'
];
const users = ['Demo Mehmet', 'Demo Ayse', 'Demo Enes', 'Demo Berfin'];
const services = ['Avrupa Servis', 'Anadolu Servis', 'Kuzey Servis', 'Guney Servis', 'Merkez Kaporta'];
const priorities = ['Normal', tr.high, tr.low, 'Kritik'];
const statuses = [tr.newFile, tr.docWaiting, tr.photoWaiting, tr.portalControl, tr.partListWaiting, tr.expertApproval, tr.repair, tr.closingControl];
const durumlar = [tr.reviewing, tr.missingDoc, tr.missingPhoto, tr.portalWaiting, tr.partWaiting, tr.expertWaiting, tr.repair, tr.closing];

for (let index = 0; index < plates.length; index += 1) {
  const n = 10500 + index;
  generatedCases.push(caseDef(
    plates[index],
    `2026/${n}`,
    `13-${18000000 + index}`,
    services[index % services.length],
    users[index % users.length],
    priorities[index % priorities.length],
    statuses[index % statuses.length],
    durumlar[index % durumlar.length],
    {
      clean: index % 7 === 0,
      missingDocs: index % 5 === 0,
      missingPhotos: index % 4 === 0,
      unsupported: index % 9 === 0,
      portalPending: index % 3 !== 0,
      rucu: index % 8 === 0,
      tasks: index % 2 === 0,
      notes: index % 2 === 1,
      closed: index % 13 === 0,
      claimType: index % 6 === 0 ? 'kasko' : 'trafik',
      followup: `2026-06-${String(14 + (index % 12)).padStart(2, '0')}`
    }
  ));
}

for (const item of fewCases) await createCase(fewRoot, item);
for (const item of [...specialCases, ...generatedCases]) await createCase(item.closed ? closedRoot : normalRoot, item);

const officeFolder = path.join(normalRoot, '_HASARBOTU_OFFICE');
await fs.mkdir(officeFolder, { recursive: true });
await writeJson(path.join(officeFolder, 'office-version.json'), {
  schemaVersion: 1,
  expectedVersion: '0.4.10',
  updatedAt: new Date().toISOString(),
  updatedBy: 'UI-DEMO',
  clients: {
    'UI-DEMO-PC': {
      computer: 'UI-DEMO-PC',
      appVersion: '0.4.10',
      user: 'Demo Raportor',
      rootPath: normalRoot,
      recordedAt: new Date().toISOString()
    }
  }
});

await writeJson(markerPath, {
  createdBy: 'HasarBotu UI demo generator',
  createdAt: new Date().toISOString(),
  roots: { emptyRoot, fewRoot, normalRoot },
  caseCounts: {
    few: fewCases.length,
    normalOpenAndClosed: specialCases.length + generatedCases.length,
    total: fewCases.length + specialCases.length + generatedCases.length
  }
});

console.log(`Demo root: ${demoRoot}`);
console.log(`Empty root: ${emptyRoot}`);
console.log(`Few-case root: ${fewRoot} (${fewCases.length} cases)`);
console.log(`Normal root: ${normalRoot} (${specialCases.length + generatedCases.length} cases)`);
console.log(`Total fake cases: ${fewCases.length + specialCases.length + generatedCases.length}`);

function caseDef(plate, officeFileNo, claimNoticeNo, serviceName, sorumlu, priority, workflowStatus, dosyaDurumu, options = {}) {
  const dosyaNo = officeFileNo.replace('/', '-');
  return {
    plate,
    officeFileNo,
    dosyaNo,
    claimNoticeNo,
    serviceName,
    sorumlu,
    priority,
    workflowStatus,
    dosyaDurumu,
    closed: options.closed === true || workflowStatus === tr.closed,
    claimType: options.claimType ?? 'trafik',
    followup: options.followup ?? '2026-06-17',
    ...options
  };
}

async function createCase(parentRoot, item) {
  const folderName = `${item.plate} - DOSYA NO ${item.dosyaNo}`;
  const caseRoot = path.join(parentRoot, folderName);
  const evrak = path.join(caseRoot, 'EVRAK');
  const hasar = path.join(caseRoot, 'HASAR');
  const olay = path.join(caseRoot, 'OLAY YERI');
  const onarim = path.join(caseRoot, 'ONARIM');
  const trackingDir = path.join(caseRoot, '_HASARBOTU');
  await fs.mkdir(evrak, { recursive: true });
  await fs.mkdir(hasar, { recursive: true });
  await fs.mkdir(olay, { recursive: true });
  await fs.mkdir(onarim, { recursive: true });
  await fs.mkdir(trackingDir, { recursive: true });

  await createDocuments(evrak, item);
  await createPhotos(hasar, item);
  await fs.writeFile(path.join(olay, 'OLAY YERI 1.jpg'), jpegBytes());
  await fs.writeFile(path.join(onarim, 'Parca iscilik listesi.xlsx'), 'fake demo workbook placeholder\n', 'utf-8');
  await writeJson(path.join(trackingDir, 'takip.json'), trackingFor(caseRoot, item));
  if (item.conflict) {
    await writeJson(path.join(trackingDir, 'takip PCLOUD CONFLICT COPY.json'), {
      demo: true,
      message: 'Fake pCloud conflict copy for UI risk testing',
      originalFile: 'takip.json'
    });
  }
}

async function createDocuments(evrak, item) {
  const docs = item.claimType === 'kasko'
    ? ['K Ruhsat.pdf', 'K Ehliyet.pdf', 'K Police.pdf', 'KTT Zabit Beyan.pdf', 'Agir Hasar Kontrol.pdf']
    : ['M Ruhsat.pdf', 'M Ehliyet.pdf', 'M Alkol Raporu.pdf', 'M Police.pdf', 'S Police.pdf', 'S Ehliyet.pdf', 'S Ruhsat.pdf', 'KTT Zabit Beyan.pdf', 'Agir Hasar Kontrol.pdf', 'Tramer Sonucu.pdf'];
  const omitted = new Set();
  if (item.missingDocs) {
    omitted.add(item.claimType === 'kasko' ? 'K Ruhsat.pdf' : 'M Ruhsat.pdf');
    omitted.add(item.claimType === 'kasko' ? 'K Ehliyet.pdf' : 'M Ehliyet.pdf');
  }
  if (!item.clean && item.missingDocs) omitted.add('Agir Hasar Kontrol.pdf');
  for (const doc of docs) {
    if (omitted.has(doc)) continue;
    await fs.writeFile(path.join(evrak, doc), `Fake demo document: ${doc}\n`, 'utf-8');
  }
  await fs.writeFile(path.join(evrak, `Ihbar Foyu ${item.claimNoticeNo}.pdf`), 'Fake claim notice\n', 'utf-8');
  if (item.rucu) await fs.writeFile(path.join(evrak, 'Karsi Taraf Police.pdf'), 'Fake counterparty policy\n', 'utf-8');
}

async function createPhotos(hasar, item) {
  const damageCount = item.missingPhotos ? 2 : 6;
  for (let i = 1; i <= damageCount; i += 1) {
    await fs.writeFile(path.join(hasar, `HASAR ${i}.jpg`), jpegBytes());
  }
  await fs.writeFile(path.join(hasar, 'KM.jpg'), jpegBytes());
  if (!item.missingPhotos) {
    await fs.writeFile(path.join(hasar, 'VITES.jpg'), jpegBytes());
    await fs.writeFile(path.join(hasar, 'SASE.jpg'), jpegBytes());
  }
  if (item.unsupported) {
    await fs.writeFile(path.join(hasar, 'IMG_9001.HEIC'), 'fake unsupported heic\n', 'utf-8');
    await fs.writeFile(path.join(hasar, 'RAW_9002.CR2'), 'fake unsupported raw\n', 'utf-8');
  }
}

function trackingFor(caseRoot, item) {
  const now = new Date().toISOString();
  const portalLabels = [
    ['foy-indirildi', 'Foy indirildi'],
    ['klasor-acildi', 'Klasor acildi'],
    ['portal-evrak-yukleme', 'Evrak portala yuklendi'],
    ['portal-fotograf-yukleme', 'Fotograflar portala yuklendi'],
    ['parca-listesi-istendi', 'Parca listesi istendi'],
    ['parca-kodlari-istendi', 'Parca kodlari istendi'],
    ['parca-iscilik-girildi', 'Parca / iscilik girisi yapildi'],
    ['on-rapor-hazirlandi', 'On rapor hazirlandi'],
    ['uzman-onayi-alindi', 'Uzman onayi alindi'],
    ['onarim-tamamlandi', 'Onarim tamamlandi'],
    ['dosya-kapanis-kontrolu', 'Kapanis kontrolu yapildi'],
    ['dosya-kapatildi', 'Dosya kapatildi']
  ];
  const completedCount = item.portalPending ? 3 : item.closed ? portalLabels.length : 8;
  return {
    schemaVersion: 1,
    caseIdentity: {
      caseKey: path.basename(caseRoot),
      plate: item.plate,
      dosyaNo: item.dosyaNo,
      officeFileNo: item.officeFileNo,
      claimNoticeNo: item.claimNoticeNo,
      folderPath: caseRoot,
      monthFolder: item.closed ? 'KAPALI HAZIRAN 2026' : path.basename(path.dirname(caseRoot)),
      isClosedFolder: item.closed
    },
    metadata: {
      createdAt: now,
      updatedAt: now,
      createdByComputer: 'UI-DEMO-PC',
      updatedByComputer: 'UI-DEMO-PC',
      revision: 3 + Number(item.officeFileNo.slice(-1) || 0),
      writeId: randomUUID()
    },
    assignment: {
      sorumlu: item.sorumlu,
      eksper: 'Demo Eksper',
      raportor: 'Demo Raportor',
      takipTarihi: item.followup,
      sonIslemTarihi: '2026-06-13',
      oncelik: item.priority
    },
    status: {
      dosyaDurumu: item.dosyaDurumu,
      workflowStatus: item.workflowStatus,
      kapaliMi: item.closed
    },
    claimType: item.claimType,
    service: {
      name: item.serviceName,
      source: 'manual',
      updatedAt: now,
      updatedBy: 'Demo Raportor'
    },
    portalChecklist: portalLabels.map(([key, label], index) => ({
      key,
      label,
      completed: index < completedCount,
      ...(index < completedCount ? { completedAt: now, completedBy: 'Demo Raportor' } : {})
    })),
    todos: item.tasks ? [
      { id: randomUUID(), title: 'Eksik evrak icin servis tekrar aranacak', completed: false, priority: item.priority, assignedTo: item.sorumlu, dueDate: item.followup, createdAt: now },
      { id: randomUUID(), title: 'Portal yukleme sonucu kontrol edilecek', completed: false, priority: 'Normal', assignedTo: 'Demo Ayse', dueDate: '2026-06-18', createdAt: now }
    ] : [],
    notes: item.notes ? [
      { id: randomUUID(), createdAt: now, createdBy: 'Demo Raportor', text: 'Sigortali arandi, eksik evrak icin hatirlatma yapildi.' },
      { id: randomUUID(), createdAt: now, createdBy: item.sorumlu, text: 'Servis dosyaya yeni fotograf ekleyecek.' }
    ] : [],
    rucu: { varMi: item.rucu === true, potansiyel: item.rucu === true, durum: item.rucu ? 'Incelenecek' : 'Yok', not: item.rucu ? 'Karsi taraf police kontrolu gerekli.' : '' },
    labor: { parcaListesiIstendi: true, parcaKodlariIstendi: item.claimType === 'kasko', parcaIscilikGirildi: item.clean === true, not: 'Demo Excel akisi icin sahte parca listesi eklendi.' },
    kttKusur: { helperOnly: true, finalDecisionWarning: 'Bu modul yalnizca yardimcidir. Nihai kusur karari kullanici tarafindan verilmelidir.', not: '' },
    heavyDamage: { enabled: item.priority === 'Kritik', helperOnly: true, finalDecisionWarning: 'Agir hasar/pert karari otomatik verilmez.', not: item.priority === 'Kritik' ? 'Demo kritik dosya.' : '' },
    audit: [
      { at: now, by: 'Demo Raportor', computer: 'UI-DEMO-PC', action: 'demo-created', text: 'UI demo takip dosyasi olusturuldu.' },
      { at: now, by: item.sorumlu, computer: 'UI-DEMO-PC', action: 'last-operation', text: 'Son operasyon demo verisi.' }
    ]
  };
}

function jpegBytes() {
  return Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0xff, 0xd9]);
}

async function prepareRoot(root, marker, shouldClean) {
  const exists = await pathExists(root);
  if (!exists) {
    await fs.mkdir(root, { recursive: true });
    return;
  }
  const markerExists = await pathExists(marker);
  if (!markerExists) {
    throw new Error(`Refusing to modify existing non-demo folder: ${root}`);
  }
  if (!shouldClean) return;
  await fs.rm(root, { recursive: true, force: true });
  await fs.mkdir(root, { recursive: true });
}

async function assertSafeDemoRoot(root) {
  const normalized = path.resolve(root).toLowerCase();
  const defaultNormalized = path.resolve(DEFAULT_DEMO_ROOT).toLowerCase();
  if (normalized !== defaultNormalized && !normalized.startsWith(`${defaultNormalized}\\`)) {
    throw new Error(`Demo root must stay under ${DEFAULT_DEMO_ROOT}. Received: ${root}`);
  }
}

async function writeJson(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf-8');
}

async function pathExists(filePath) {
  return fs.access(filePath).then(() => true, () => false);
}

function parseArgs(argv) {
  const parsed = { force: true };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--root') parsed.root = argv[++i];
    else if (arg === '--no-clean') parsed.force = false;
    else if (arg === '--force') parsed.force = true;
  }
  return parsed;
}
