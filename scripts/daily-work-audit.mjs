import fs from 'node:fs';
import { buildDailyWorkSummary, matchesDailyWorkFilter } from '../dist-electron/shared/daily-work.js';
import { buildDataQualitySummary, matchesDataQualityFilter } from '../dist-electron/shared/data-quality.js';

const checks = [];
function ok(name) { checks.push({ name, ok: true }); console.log(`TAMAM - ${name}`); }
function fail(name, message) { checks.push({ name, ok: false, message }); console.error(`HATA - ${name}: ${message}`); }
function assert(condition, name, message) { condition ? ok(name) : fail(name, message); }

const today = '2026-06-14';
const activeUser = 'Ayşe Raportör';
const cases = [
  makeCase({
    plate: '34RISK001',
    sorumlu: 'Mehmet Uzman',
    takipTarihi: '2026-06-30',
    trackingIssue: { type: 'pcloud-conflict-copy', severity: 'critical', title: 'pCloud çakışması', message: 'Çakışma kopyası var.' }
  }),
  makeCase({
    plate: '34PDF999',
    sorumlu: 'Mehmet Uzman',
    takipTarihi: '2026-06-30',
    zararGorenPlateCheck: {
      source: 'zarar-goren-arac',
      status: 'mismatch',
      expectedPlate: '34PDF999',
      detectedPlate: '06ABC123',
      fileName: '8-858393738.pdf',
      message: 'İhbar PDF plaka uyuşmazlığı: Zarar Gören Araç plakası 06ABC123, klasör plakası 34PDF999.'
    }
  }),
  makeCase({
    plate: '34LATE002',
    sorumlu: activeUser,
    takipTarihi: '2026-06-13'
  }),
  makeCase({
    plate: '34TODAY3',
    sorumlu: 'Sistem',
    takipTarihi: today,
    todos: [{ id: 'todo-today', title: 'Servisi ara', completed: false, priority: 'Normal', assignedTo: activeUser, dueDate: today, createdAt: '2026-06-13T09:00:00.000Z' }]
  }),
  makeCase({
    plate: '34WEEK04',
    sorumlu: 'Mehmet Uzman',
    takipTarihi: '2026-06-18'
  }),
  makeCase({
    plate: '34MINE05',
    sorumlu: activeUser,
    takipTarihi: '2026-06-30'
  }),
  makeCase({
    plate: '34UNOWN',
    sorumlu: '',
    takipTarihi: '2026-06-19'
  }),
  makeCase({
    plate: '34STALE',
    sorumlu: 'Mehmet Uzman',
    takipTarihi: '2026-06-25',
    sonIslemTarihi: '2026-06-09',
    updatedAt: '2026-06-09T09:00:00.000Z'
  }),
  makeCase({
    plate: '34CLOSED',
    sorumlu: activeUser,
    takipTarihi: '2026-06-12',
    workflowStatus: 'Kapalı',
    isClosedFolder: true,
    kapaliMi: true,
    statusIsClosed: true,
    todos: [{ id: 'todo-closed', title: 'Kapalı dosyada kalan görev', completed: false, priority: 'Normal', assignedTo: activeUser, dueDate: '2026-06-20', createdAt: '2026-06-13T09:00:00.000Z' }]
  })
];

const summary = buildDailyWorkSummary(cases, activeUser, today);
assert(summary.mineCount === 3, 'Günlük iş masası bendeki açık dosyaları sayar', JSON.stringify(summary));
assert(summary.overdueCount === 1, 'Günlük iş masası geciken açık dosyaları sayar', JSON.stringify(summary));
assert(summary.todayCount === 1, 'Günlük iş masası bugünkü takip/görevleri sayar', JSON.stringify(summary));
assert(summary.weekCount === 2, 'Günlük iş masası bu hafta takip edilecekleri sayar', JSON.stringify(summary));
assert(summary.riskCount === 1, 'Günlük iş masası riskli açık dosyaları sayar', JSON.stringify(summary));
assert(summary.unassignedCount === 1, 'Günlük iş masası sahipsiz açık dosyaları sayar', JSON.stringify(summary));
assert(summary.staleCount === 1, 'Günlük iş masası durgun açık dosyaları sayar', JSON.stringify(summary));
assert(summary.qualityIssueCount === 5 && summary.qualityCriticalCount === 4, 'Günlük iş masası veri kalitesi sayımlarını üretir', JSON.stringify(summary));
assert(summary.focusItems.slice(0, 4).some((item) => item.plate === '34LATE002') && summary.focusItems.slice(0, 4).some((item) => item.plate === '34UNOWN'), 'Öncelik sırası kritik kalite ve gecikmeyi üste alır', JSON.stringify(summary.focusItems));

assert(matchesDailyWorkFilter(cases[2], 'mine', activeUser, today), 'Bendeki filtresi sorumlu kullanıcıyı yakalar', cases[2]?.plate);
assert(matchesDailyWorkFilter(cases[3], 'mine', activeUser, today), 'Bendeki filtresi kullanıcıya atanmış görevi yakalar', cases[3]?.plate);
assert(matchesDailyWorkFilter(cases[2], 'overdue', activeUser, today), 'Geciken filtresi geçmiş takip tarihini yakalar', cases[2]?.plate);
assert(matchesDailyWorkFilter(cases[3], 'today', activeUser, today), 'Bugün filtresi bugünkü görev tarihini yakalar', cases[3]?.plate);
assert(matchesDailyWorkFilter(cases[4], 'week', activeUser, today), 'Bu hafta filtresi 7 gün içindeki takipleri yakalar', cases[4]?.plate);
assert(matchesDailyWorkFilter(cases[6], 'unassigned', activeUser, today), 'Sahipsiz filtresi sorumlusu boş açık dosyayı yakalar', cases[6]?.plate);
assert(matchesDailyWorkFilter(cases[7], 'stale', activeUser, today), 'Durgun filtresi son işlemi eski açık dosyayı yakalar', cases[7]?.plate);
assert(matchesDailyWorkFilter(cases[1], 'quality', activeUser, today), 'Veri kalitesi filtresi PDF plaka uyuşmazlığını yakalar', cases[1]?.plate);
assert(matchesDailyWorkFilter(cases[8], 'quality', activeUser, today), 'Veri kalitesi filtresi kapalı dosyada açık görevi yakalar', cases[8]?.plate);
assert(!matchesDailyWorkFilter(cases[8], 'overdue', activeUser, today), 'Kapalı dosya günlük açık iş filtrelerine girmez', cases[8]?.plate);

const quality = buildDataQualitySummary(cases, today);
const pdfPlateIssue = quality.casesWithIssues.find((item) => item.plate === '34PDF999')?.issues.find((issue) => issue.code === 'pdf-plate-mismatch');
assert(quality.caseCount === 5 && quality.closedOpenTodoCount === 1, 'Veri kalitesi özeti saha pilot risklerini sayar', JSON.stringify(quality));
assert(pdfPlateIssue?.severity === 'critical', 'Veri kalitesi PDF plaka uyuşmazlığını kritik sayar', JSON.stringify(pdfPlateIssue));
assert(matchesDataQualityFilter(cases[6], 'unassigned', today) && matchesDataQualityFilter(cases[7], 'stale', today), 'Veri kalitesi filtreleri sahipsiz ve durgun dosyayı yakalar', JSON.stringify(quality));

const dashboardSource = fs.readFileSync('src/renderer/app/components/dashboard.ts', 'utf-8');
const casesSource = fs.readFileSync('src/renderer/app/components/cases.ts', 'utf-8');
assert(dashboardSource.includes('Bugün İş Masası') && dashboardSource.includes('Veri Kalitesi') && dashboardSource.includes('daily-work-desk'), 'Dashboard sabah iş masası v2 alanını render eder', 'dashboard izi eksik');
assert(['mine', 'overdue', 'today', 'week', 'risk', 'unassigned', 'stale', 'quality'].every((key) => casesSource.includes(`case '${key}'`)), 'Dosya listesi günlük iş v2 filtrelerini destekler', 'günlük filtre switch izi eksik');

const failed = checks.filter((item) => !item.ok);
if (failed.length) {
  console.error(`Günlük iş masası denetimi başarısız: ${failed.length} hata.`);
  process.exit(1);
}
console.log(`Günlük iş masası denetimi geçti: ${checks.length} kontrol.`);

function makeCase(overrides = {}) {
  const plate = overrides.plate ?? '34TEST00';
  const takipTarihi = overrides.takipTarihi ?? '';
  const workflowStatus = overrides.workflowStatus ?? 'Onarımda';
  const kapaliMi = overrides.kapaliMi ?? false;
  const todos = overrides.todos ?? [];
  const sonIslemTarihi = overrides.sonIslemTarihi ?? today;
  return {
    id: plate,
    plate,
    dosyaNo: overrides.dosyaNo ?? '',
    officeFileNo: overrides.officeFileNo ?? `2026/${plate.slice(-2)}`,
    claimNoticeNo: overrides.claimNoticeNo ?? '',
    monthFolder: 'Haziran 2026',
    folderPath: `C:\\fake\\${plate}`,
    isClosedFolder: overrides.isClosedFolder ?? false,
    claimType: overrides.claimType ?? 'trafik',
    workflowStatus,
    dosyaDurumu: workflowStatus,
    oncelik: overrides.oncelik ?? 'Normal',
    sorumlu: overrides.sorumlu ?? '',
    serviceName: overrides.serviceName ?? 'Demo Servis',
    eksper: '',
    raportor: '',
    takipTarihi,
    revision: 1,
    updatedAt: overrides.updatedAt ?? '2026-06-14T09:00:00.000Z',
    documentAnalysis: {
      claimType: overrides.claimType ?? 'trafik',
      evrakFolderExists: true,
      filesScanned: 0,
      requirements: [],
      missingCritical: overrides.missingCritical ?? [],
      claimNoticeNo: '',
      claimNoticeFiles: [],
      hasKttOrZabitOrBeyan: true,
      counterpartyPolicyCandidate: false,
      conflictFiles: [],
      warnings: [],
      ...(overrides.zararGorenPlateCheck ? { zararGorenPlateCheck: overrides.zararGorenPlateCheck } : {})
    },
    photoAnalysis: {
      hasarFolderExists: true,
      totalImageFiles: 4,
      damagePhotoCount: overrides.damagePhotoCount ?? 4,
      hasKm: true,
      hasVites: true,
      hasSaseOrSasi: true,
      unsupportedFiles: overrides.unsupportedFiles ?? [],
      corruptSuspects: [],
      previews: [],
      warnings: []
    },
    folderContents: { groups: [], totalFilesScanned: 0, warnings: [] },
    tracking: {
      schemaVersion: 1,
      caseIdentity: {
        caseKey: plate,
        plate,
        dosyaNo: '',
        officeFileNo: '',
        claimNoticeNo: '',
        folderPath: `C:\\fake\\${plate}`,
        monthFolder: 'Haziran 2026',
        isClosedFolder: overrides.isClosedFolder ?? false
      },
      metadata: {
        createdAt: '2026-06-14T09:00:00.000Z',
        updatedAt: '2026-06-14T09:00:00.000Z',
        createdByComputer: 'audit',
        updatedByComputer: 'audit',
        revision: 1,
        writeId: 'write-id'
      },
      assignment: {
        sorumlu: overrides.sorumlu ?? '',
        eksper: '',
        raportor: '',
        takipTarihi,
        sonIslemTarihi,
        oncelik: overrides.oncelik ?? 'Normal'
      },
      status: { dosyaDurumu: workflowStatus, workflowStatus, kapaliMi },
      claimType: overrides.claimType ?? 'trafik',
      service: { name: 'Demo Servis', source: 'manual', updatedAt: today, updatedBy: 'audit' },
      portalChecklist: overrides.portalChecklist ?? [],
      todos,
      notes: [],
      rucu: { varMi: false, potansiyel: false, durum: '', not: '' },
      labor: { parcaListesiIstendi: false, parcaKodlariIstendi: false, parcaIscilikGirildi: false, not: '' },
      kttKusur: { helperOnly: true, finalDecisionWarning: '', not: '' },
      heavyDamage: { helperOnly: true, finalDecisionWarning: '', not: '', enabled: false },
      audit: []
    },
    trackingSummary: { noteCount: 0, todoCount: todos.length, openTodoCount: todos.filter((todo) => !todo.completed).length, lastNoteText: '', lastNoteBy: '', lastNoteAt: '' },
    fingerprint: { folderPath: `C:\\fake\\${plate}`, mtimeMs: 0, size: 0, childCount: 0, evrakMtimeMs: 0, hasarMtimeMs: 0, trackingMtimeMs: 0, hash: 'hash' },
    searchText: plate,
    corruptTracking: overrides.corruptTracking,
    trackingIssue: overrides.trackingIssue,
    caseIssues: overrides.caseIssues,
    statusIsClosed: overrides.statusIsClosed
  };
}
