/**
 * v0.6.x — AI Yardımcıları için SALT-OKUNUR seçili dosya bağlamı + saf eşleme türetmeleri.
 *
 * SAF + isomorfik (main + renderer): ağ/dosya/electron/DOM yok. Yalnızca mevcut dosya verisinden
 * TÜRETİR; hiçbir kalıcı alan yazmaz. Öncelik: otomatik (takip/heavy/doc) < kayıtlı aiHelperContext < geçici UI.
 * Çıktı eksper yardımcısı/kontrol amaçlıdır.
 */
import type { CaseIndexItem, ClaimType } from '../types';
import type { SigortaTuru } from '../mevzuat/report-template-rules';
import type { VehicleClass } from '../fees/expertise-fee-types';
import type { AiHelperContextInput } from './ai-helper-context-types';

export type AiFieldProvenance = 'auto' | 'saved' | 'temp';

export interface AiCaseContext {
  folderPath: string;
  plate: string;
  officeFileNo: string;
  noticeFileNo: string;
  claimType: ClaimType;
  /** Çözümlenmiş sigorta türü (override dahil; trafik/kasko/ihtiyari). null = belirsiz. */
  sigortaTuru: SigortaTuru | null;
  /** Çözümlenmiş araç grubu (yalnız ek bağlamdan; otomatik türetilmez). null = belirsiz. */
  vehicleGroup: VehicleClass | null;
  insurer: string;
  responsible: string;
  serviceName: string;
  status: string;
  followUpDate: string;
  lastActionDate: string;
  grossDamageAmount: number | null;
  marketValue: number | null;
  damageRatio: number | null;
  isHeavyDamage: boolean | null;
  isTotalLoss: boolean | null;
  hasValueLoss: boolean | null;
  cityScope: 'sehir-ici' | 'sehir-disi' | null;
  appointmentDate: string;
  reportReadyDate: string;
  preliminaryReportDate: string;
  vehicleDeliveredToService: boolean | null;
  missingDocuments: readonly string[];
  warnings: readonly string[];
  sourceConfidence: 'yuksek' | 'orta' | 'dusuk';
  /** Hangi alan otomatik mi, kayıtlı ek bilgiden mi, geçici UI'dan mı geldi (rozet için). */
  provenance: Readonly<Record<string, AiFieldProvenance>>;
}

function claimToSigorta(claimType: ClaimType): SigortaTuru | null {
  return claimType === 'trafik' ? 'trafik' : claimType === 'kasko' ? 'kasko' : null;
}

/** Dosya seçili değilken kullanılacak boş bağlam (düşük güvenli). */
export function blankAiCaseContext(): AiCaseContext {
  return {
    folderPath: '', plate: '', officeFileNo: '', noticeFileNo: '', claimType: 'unknown', sigortaTuru: null,
    vehicleGroup: null, insurer: '', responsible: '', serviceName: '', status: '', followUpDate: '', lastActionDate: '',
    grossDamageAmount: null, marketValue: null, damageRatio: null, isHeavyDamage: null, isTotalLoss: null,
    hasValueLoss: null, cityScope: null, appointmentDate: '', reportReadyDate: '', preliminaryReportDate: '',
    vehicleDeliveredToService: null, missingDocuments: [], warnings: [], sourceConfidence: 'dusuk', provenance: {}
  };
}

/** Seçili dosyadan AiCaseContext türetir; varsa kayıtlı aiHelperContext'i uygular. Dosya yoksa null. */
export function buildAiCaseContext(item: CaseIndexItem | null): AiCaseContext | null {
  if (!item) return null;
  const t = item.tracking;
  const summary = t?.heavyDamageAssessment?.summary;
  const warnings: string[] = [];

  const grossDamageAmount = typeof summary?.repairCost === 'number' ? summary.repairCost : null;
  const marketValue = typeof summary?.marketValue === 'number' ? summary.marketValue : null;
  const damageRatio = typeof summary?.repairToMarketRatio === 'number' ? summary.repairToMarketRatio : null;

  let isHeavyDamage: boolean | null = null;
  if (summary) isHeavyDamage = summary.thresholdExceeded === true || summary.directThresholdExceeded === true || t?.heavyDamage?.enabled === true;
  else if (t?.heavyDamage?.enabled === true) isHeavyDamage = true;
  const isTotalLoss: boolean | null = summary ? summary.economicThresholdExceeded === true : null;

  if (grossDamageAmount === null) warnings.push('Hasar tutarı dosya bilgisinden otomatik bulunamadı.');
  if (isHeavyDamage === null) warnings.push('Ağır/tam hasar durumu dosyadan netleştirilemedi.');
  warnings.push('Sigorta şirketi, araç grubu ve şehir içi/dışı bilgisi dosyada tutulmaz; "Dosya Ek Bilgileri" ile elle belirlenebilir.');

  const claimType: ClaimType = item.claimType ?? 'unknown';
  const plate = item.plate || t?.caseIdentity?.plate || t?.vehicleContext?.plate || '';

  const base: AiCaseContext = {
    folderPath: item.folderPath,
    plate,
    officeFileNo: item.officeFileNo || t?.caseIdentity?.officeFileNo || '',
    noticeFileNo: item.claimNoticeNo || t?.caseIdentity?.claimNoticeNo || item.documentAnalysis?.claimNoticeNo || '',
    claimType,
    sigortaTuru: claimToSigorta(claimType),
    vehicleGroup: null,
    insurer: '',
    responsible: item.sorumlu || t?.assignment?.sorumlu || '',
    serviceName: item.serviceName || t?.service?.name || '',
    status: item.workflowStatus || t?.status?.workflowStatus || '',
    followUpDate: item.takipTarihi || t?.assignment?.takipTarihi || '',
    lastActionDate: t?.assignment?.sonIslemTarihi || item.updatedAt || '',
    grossDamageAmount,
    marketValue,
    damageRatio,
    isHeavyDamage,
    isTotalLoss,
    hasValueLoss: null,
    cityScope: null,
    appointmentDate: '',
    reportReadyDate: '',
    preliminaryReportDate: '',
    vehicleDeliveredToService: null,
    missingDocuments: item.documentAnalysis?.missingCritical ?? [],
    warnings,
    sourceConfidence: claimType === 'unknown' || !plate ? 'dusuk' : grossDamageAmount !== null ? 'yuksek' : 'orta',
    provenance: {}
  };

  // Kayıtlı ek bağlam varsa otomatik tahminin ÜZERİNE uygulanır.
  const saved = t?.aiHelperContext;
  return saved ? applyAiHelperOverride(base, saved, 'saved') : base;
}

function vehicleGroupToClass(value: AiHelperContextInput['vehicleGroup']): VehicleClass | null {
  if (value === 'binek_hafif_ticari_motosiklet') return 'binek-hafif-ticari-motosiklet';
  if (value === 'agir_vasita') return 'agir-vasita';
  if (value === 'is_makinesi') return 'is-makinesi';
  return null;
}

function overrideSigorta(value: AiHelperContextInput['claimTypeOverride']): SigortaTuru | null {
  if (value === 'trafik') return 'trafik';
  if (value === 'kasko') return 'kasko';
  if (value === 'ihtiyari') return 'ihtiyari-mali-sorumluluk';
  return null;
}

/**
 * Bir AiCaseContext'in üzerine ek bağlam (kayıtlı 'saved' veya geçici 'temp') uygular.
 * Yalnızca 'belirsiz'/boş olmayan alanlar override eder; provenance işaretlenir. SAF (yeni nesne döner).
 */
export function applyAiHelperOverride(ctx: AiCaseContext, ov: AiHelperContextInput | null | undefined, tag: AiFieldProvenance): AiCaseContext {
  if (!ov) return ctx;
  const next: AiCaseContext = { ...ctx };
  const provenance: Record<string, AiFieldProvenance> = { ...ctx.provenance };

  const sig = overrideSigorta(ov.claimTypeOverride);
  if (sig) { next.sigortaTuru = sig; provenance.sigortaTuru = tag; if (sig === 'trafik' || sig === 'kasko') next.claimType = sig; }

  const vg = vehicleGroupToClass(ov.vehicleGroup);
  if (vg) { next.vehicleGroup = vg; provenance.vehicleGroup = tag; }

  if (ov.hasValueLoss === true || ov.hasValueLoss === false) { next.hasValueLoss = ov.hasValueLoss; provenance.hasValueLoss = tag; }

  if (ov.cityScope === 'ayni_il') { next.cityScope = 'sehir-ici'; provenance.cityScope = tag; }
  else if (ov.cityScope === 'farkli_il') { next.cityScope = 'sehir-disi'; provenance.cityScope = tag; }

  if (typeof ov.insurerName === 'string' && ov.insurerName.trim()) { next.insurer = ov.insurerName.trim(); provenance.insurer = tag; }
  if (typeof ov.appointmentDateTime === 'string' && ov.appointmentDateTime.trim()) { next.appointmentDate = ov.appointmentDateTime.trim(); provenance.appointmentDate = tag; }
  if (typeof ov.preliminaryReportDate === 'string' && ov.preliminaryReportDate.trim()) { next.preliminaryReportDate = ov.preliminaryReportDate.trim(); provenance.preliminaryReportDate = tag; }
  if (typeof ov.reportReadyDate === 'string' && ov.reportReadyDate.trim()) { next.reportReadyDate = ov.reportReadyDate.trim(); provenance.reportReadyDate = tag; }
  if (ov.vehicleDeliveredToService === true || ov.vehicleDeliveredToService === false) { next.vehicleDeliveredToService = ov.vehicleDeliveredToService; provenance.vehicleDeliveredToService = tag; }

  // Kullanıcı bilgisi güveni artırır (en az 'orta').
  if (next.sourceConfidence === 'dusuk') next.sourceConfidence = 'orta';
  next.provenance = provenance;
  return next;
}

/** Şablon seçici için bağlamdan türetilen girdi (sigortaTuru bulunamazsa undefined). */
export function deriveTemplateInput(ctx: AiCaseContext): { sigortaTuru?: SigortaTuru; degerKaybiDahil: boolean; agirVeyaTamHasar: boolean } {
  return {
    ...(ctx.sigortaTuru ? { sigortaTuru: ctx.sigortaTuru } : {}),
    degerKaybiDahil: ctx.hasValueLoss === true,
    agirVeyaTamHasar: ctx.isHeavyDamage === true || ctx.isTotalLoss === true
  };
}

/** Ücret yardımcısı için bağlamdan türetilen ön-doldurma. vehicleClass yalnız ek bağlamda varsa eklenir. */
export function deriveFeePrefill(ctx: AiCaseContext): {
  kapsam: 'motorlu' | 'motorlu-disi';
  brutHasar: string;
  degerKaybi: 'yok' | 'tek-basina' | 'maddi-hasarla-birlikte';
  sehirDisi: boolean;
  vehicleClass?: VehicleClass;
} {
  return {
    kapsam: 'motorlu',
    brutHasar: ctx.grossDamageAmount !== null ? String(ctx.grossDamageAmount) : '',
    degerKaybi: ctx.hasValueLoss === true ? 'maddi-hasarla-birlikte' : 'yok',
    sehirDisi: ctx.cityScope === 'sehir-disi',
    ...(ctx.vehicleGroup ? { vehicleClass: ctx.vehicleGroup } : {})
  };
}

/** Deadline yardımcısı için dosya türü (trafik / diğer motorlu). */
export function deriveDeadlineDosyaTuru(ctx: AiCaseContext): 'trafik' | 'diger-motorlu' {
  return ctx.sigortaTuru === 'trafik' ? 'trafik' : 'diger-motorlu';
}

/** Mevzuat tarayıcıya bağlamdan önerilen filtre terimleri (mevcut çip terimleriyle uyumlu). */
export function suggestMevzuatTerms(ctx: AiCaseContext): readonly string[] {
  const terms: string[] = [];
  if (ctx.sigortaTuru === 'kasko') terms.push('kasko', 'ağır hasar');
  else if (ctx.sigortaTuru === 'trafik' || ctx.sigortaTuru === 'ihtiyari-mali-sorumluluk') terms.push('trafik', 'değer kaybı');
  if (ctx.isHeavyDamage === true || ctx.isTotalLoss === true) terms.push('ağır hasar', 'tam hasar');
  if (ctx.missingDocuments.length > 0) terms.push('ön rapor');
  return [...new Set(terms)];
}

/** Birincil (otomatik uygulanacak) mevzuat filtre terimi. */
export function primaryMevzuatTerm(ctx: AiCaseContext): string {
  return suggestMevzuatTerms(ctx)[0] ?? '';
}
