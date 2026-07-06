/**
 * v0.6.x — AI Değer Kaybı Yardımcısı v1: reel piyasa analizi esaslarına göre değer kaybı kontrol listesi.
 * SAF (ağ/dosya/electron/DOM yok). Bilgi yoksa uydurmaz; `missing` / `control_needed` işaretler.
 */

export type ValueLossChecklistStatus = 'ok' | 'missing' | 'control_needed' | 'not_applicable';
export type ValueLossChecklistSeverity = 'info' | 'warning' | 'critical';

export interface ValueLossChecklistItem {
  id: string;
  label: string;
  status: ValueLossChecklistStatus;
  severity: ValueLossChecklistSeverity;
  reason?: string;
}

export interface ValueLossChecklistCategory {
  key: string;
  title: string;
  items: ValueLossChecklistItem[];
}

export interface ValueLossChecklistSummary {
  total: number;
  ok: number;
  missing: number;
  controlNeeded: number;
  criticalMissing: number;
}

export interface ValueLossChecklistInput {
  // Dosya bilgisi
  isTrafikOrZmss?: boolean | null;
  assignmentAfterEffective?: boolean | null;
  sameReportForValueLoss?: boolean | null;
  reportTemplateEk11?: boolean | null;
  // Araç bilgisi
  brandModel?: string | null;
  modelYear?: string | number | null;
  km?: string | number | null;
  marketValue?: number | null;
  vehicleGroup?: string | null;
  commercialOrRental?: boolean | null;
  sbmPastDamageCount?: number | null;
  hasPastHeavyDamage?: boolean | null;
  // Hasar bilgisi
  changedParts?: readonly string[] | null;
  repairedParts?: readonly string[] | null;
  paintedParts?: readonly string[] | null;
  paintScopeKnown?: boolean | null;
  laborCost?: number | null;
  newPartPrice?: number | null;
  /** v2: tutar yerine "bedel belli mi?" bilgisi (formdan); true → ok, false → missing. */
  laborCostKnown?: boolean | null;
  newPartPriceKnown?: boolean | null;
  partStructuralClassKnown?: boolean | null;
  /** v4: yapılandırılmış parça listesi hazırlığı (SEİK katsayı çözümü). */
  structuredPartsCount?: number | null;
  structuredPartsAllResolved?: boolean | null;
  structuredSeverityAllKnown?: boolean | null;
  structuredPaintAllKnown?: boolean | null;
  damageAmountEntered?: boolean | null;
  /** v5: hasar tarihi / araç türü / B-otobüs çarpanı netliği / opsiyonel özet kaydı. */
  damageDateEntered?: boolean | null;
  vehicleTypeKnown?: boolean | null;
  /** Yalnız B grubunda anlamlı; undefined = uygulanmaz. */
  busMultiplierClear?: boolean | null;
  snapshotSaved?: boolean | null;
  /** v6: cabrio bayrağı/satırı varsa true (kontrol maddesi tetiklenir); undefined = uygulanmaz. */
  cabrioCheckNeeded?: boolean | null;
  /** v8: kayıtlı özetin tazelik durumu (asla kritik değil). */
  snapshotFreshness?: 'fresh' | 'stale' | 'unknown' | 'none' | null;
  /** v9: geçmiş kayıt tazelik özeti (asla kritik değil). */
  historyFreshness?: 'clean' | 'attention' | 'none' | null;
  samePartPreviousDamage?: boolean | null;
  // Piyasa analizi
  comparableListingCount?: number | null;
  listingsWithin30Days?: boolean | null;
  listingIdsVisible?: boolean | null;
  marketScreenshotsTaken?: boolean | null;
  listingSimilarityJustified?: boolean | null;
  outliersExcluded?: boolean | null;
  marketRealityJustified?: boolean | null;
  // Rapor / evidence
  calcModuleOutput?: boolean | null;
  reportMarketScreenshots?: boolean | null;
  photos?: boolean | null;
  partRepairReasons?: boolean | null;
  methodExplainedInReport?: boolean | null;
  dataStoredDigitally?: boolean | null;
}

type St = ValueLossChecklistStatus;
type Sev = ValueLossChecklistSeverity;

function mk(id: string, label: string, status: St, severity: Sev, reason?: string): ValueLossChecklistItem {
  return reason ? { id, label, status, severity, reason } : { id, label, status, severity };
}

function hasText(v: unknown): boolean {
  return typeof v === 'string' ? v.trim().length > 0 : typeof v === 'number' && Number.isFinite(v);
}
function hasList(v: readonly unknown[] | null | undefined): boolean {
  return Array.isArray(v) && v.length > 0;
}
function posNum(v: unknown): boolean {
  return typeof v === 'number' && Number.isFinite(v) && v > 0;
}

/** v8: kayıtlı özet tazelik maddesi (asla kritik değil; none→uygulanmaz, unknown/stale→warning, fresh→ok). */
function freshnessItem(status: ValueLossChecklistInput['snapshotFreshness']): ValueLossChecklistItem {
  const id = 'vl-rapor-ozet-guncel';
  const label = 'Kayıtlı ön hesap özeti güncel mi?';
  if (status === 'fresh') return mk(id, label, 'ok', 'info');
  if (status === 'stale') return mk(id, label, 'control_needed', 'warning', 'Kayıtlı özet mevcut form verileriyle aynı veri sürümüne ait görünmüyor; ön hesabı yenileyip yeniden kaydetmeniz önerilir.');
  if (status === 'unknown') return mk(id, label, 'control_needed', 'warning', 'Kayıtlı özetin veri sürümü bilinmiyor; güncelliği kontrol edilmelidir.');
  return mk(id, label, 'not_applicable', 'info', 'Kayıtlı ön hesap özeti yok (opsiyonel).');
}

/** v9: geçmiş kayıt tazelik maddesi (asla kritik değil; none→uygulanmaz, clean→ok, attention→warning). */
function historyFreshnessItem(status: ValueLossChecklistInput['historyFreshness']): ValueLossChecklistItem {
  const id = 'vl-rapor-gecmis-guncel';
  const label = 'Ön hesap geçmişinde eski veriyle oluşturulmuş kayıt var mı?';
  if (status === 'clean') return mk(id, label, 'ok', 'info');
  if (status === 'attention') return mk(id, label, 'control_needed', 'warning', 'Geçmişte mevcut form verileriyle aynı veri sürümüne ait olmayan (eski/bilinmeyen) kayıt var; güncel değerlendirme için en son özet esas alınmalı.');
  return mk(id, label, 'not_applicable', 'info', 'Ön hesap geçmişi yok (opsiyonel).');
}

/** Elde olması gereken bir değerin varlığını denetler: var → ok, yok → missing (verilen ağırlıkta). */
function presenceItem(id: string, label: string, present: boolean, sev: Sev): ValueLossChecklistItem {
  return present ? mk(id, label, 'ok', 'info') : mk(id, label, 'missing', sev, 'Bilgi eksik.');
}

/** Evet/hayır bilgisi: true → ok, false → missing, bilinmiyor → control_needed. */
function boolItem(id: string, label: string, v: boolean | null | undefined, sev: Sev): ValueLossChecklistItem {
  if (v === true) return mk(id, label, 'ok', 'info');
  if (v === false) return mk(id, label, 'missing', sev, 'Bu bilgi mevcut değil / işaretlenmemiş.');
  return mk(id, label, 'control_needed', sev, 'Bilgi girilmemiş; kontrol gerekli.');
}

/** v2: tutar VEYA "bedel belli" bilgisiyle değerlendirir (tutar > bilgi > eksik). */
function amountOrKnownItem(id: string, label: string, amount: number | null | undefined, known: boolean | null | undefined, sev: Sev): ValueLossChecklistItem {
  if (posNum(amount) || known === true) return mk(id, label, 'ok', 'info');
  if (known === false) return mk(id, label, 'missing', sev, 'Bedel belli değil olarak işaretlenmiş.');
  return mk(id, label, 'missing', sev, 'Bilgi eksik.');
}

/** Geçmiş hasar göstergesi: bilinmiyor → control_needed, var → ok+uyarı, yok → ok. */
function pastDamageItem(id: string, label: string, v: boolean | null | undefined): ValueLossChecklistItem {
  if (v === true) return mk(id, label, 'ok', 'warning', 'Geçmiş ağır hasar mevcut; değer kaybını etkileyebilir.');
  if (v === false) return mk(id, label, 'ok', 'info');
  return mk(id, label, 'control_needed', 'warning', 'Bilgi girilmemiş; kontrol gerekli.');
}

/**
 * Değer kaybı kontrol listesini 5 kategoride üretir. Girdi alanı yoksa item `missing`/`control_needed`
 * kalır (uydurma yok). Renderer bu listeyi salt-okunur gösterir.
 */
export function buildValueLossChecklist(input: ValueLossChecklistInput): ValueLossChecklistCategory[] {
  const dosya: ValueLossChecklistItem[] = [
    boolItem('vl-dosya-trafik', 'Trafik/ZMSS dosyası mı?', input.isTrafikOrZmss, 'warning'),
    boolItem('vl-dosya-tarih', 'Atama tarihi 01.07.2026 sonrası mı?', input.assignmentAfterEffective, 'warning'),
    boolItem('vl-dosya-ayni-rapor', 'Hasar raporu ile değer kaybı aynı raporda mı değerlendirilecek?', input.sameReportForValueLoss, 'warning'),
    boolItem('vl-dosya-ek11', 'Rapor şablonu Ek-1.1 / tek tip trafik raporuna uygun mu?', input.reportTemplateEk11, 'warning')
  ];

  const arac: ValueLossChecklistItem[] = [
    presenceItem('vl-arac-marka', 'Marka / model', hasText(input.brandModel), 'warning'),
    presenceItem('vl-arac-yil', 'Model yılı', hasText(input.modelYear), 'warning'),
    presenceItem('vl-arac-km', 'Kilometre / çalışma saati', hasText(input.km), 'warning'),
    presenceItem('vl-arac-rayic', 'Rayiç bedel', posNum(input.marketValue), 'critical'),
    presenceItem('vl-arac-grup', 'Araç grubu', hasText(input.vehicleGroup), 'info'),
    boolItem('vl-arac-ticari', 'Ticari / kiralık durumu', input.commercialOrRental, 'info'),
    (typeof input.sbmPastDamageCount === 'number'
      ? mk('vl-arac-sbm', 'SBM geçmiş hasar adedi', 'ok', 'info')
      : mk('vl-arac-sbm', 'SBM geçmiş hasar adedi', 'control_needed', 'warning', 'SBM sorgusu girilmemiş; kontrol gerekli.')),
    pastDamageItem('vl-arac-gecmis-agir', 'Geçmiş ağır hasar var mı?', input.hasPastHeavyDamage),
    // v5: araç türü + B grubu otobüs çarpanı netliği
    boolItem('vl-arac-turu', 'Araç türü biliniyor mu?', input.vehicleTypeKnown, 'warning'),
    (input.busMultiplierClear === undefined || input.busMultiplierClear === null
      ? mk('vl-arac-otobus-carpan', 'B grubu otobüs çarpanı net mi?', 'not_applicable', 'info', 'Araç grubu B değil; otobüs çarpanı uygulanmaz.')
      : boolItem('vl-arac-otobus-carpan', 'B grubu otobüs çarpanı net mi?', input.busMultiplierClear, 'warning')),
    // v6: cabrio/özel yan panel satırları (esaslar 3.7) — yalnız ilgili durumda kontrol ister
    (input.cabrioCheckNeeded === true
      ? mk('vl-arac-cabrio', 'Cabrio/özel yan panel satır kullanımı kontrol edildi mi?', 'control_needed', 'warning', 'Esaslar 3.7: cabrio-özel satırlar eksper kontrolü gerektirir; otomatik ikame yapılmaz.')
      : mk('vl-arac-cabrio', 'Cabrio/özel yan panel satır kullanımı kontrol edildi mi?', 'not_applicable', 'info', 'Cabrio bayrağı/satırı yok.'))
  ];

  const hasar: ValueLossChecklistItem[] = [
    presenceItem('vl-hasar-degisen', 'Değişen parçalar', hasList(input.changedParts), 'critical'),
    presenceItem('vl-hasar-onarilan', 'Onarılan parçalar', hasList(input.repairedParts), 'warning'),
    presenceItem('vl-hasar-boyanan', 'Boyanan parçalar', hasList(input.paintedParts), 'warning'),
    boolItem('vl-hasar-boya-ayrim', 'Lokal / tam boya ayrımı', input.paintScopeKnown, 'warning'),
    amountOrKnownItem('vl-hasar-iscilik', 'Onarım işçilik bedeli', input.laborCost, input.laborCostKnown, 'warning'),
    amountOrKnownItem('vl-hasar-parca-fiyat', 'Yeni parça fiyatı', input.newPartPrice, input.newPartPriceKnown, 'warning'),
    boolItem('vl-hasar-parca-sinif', 'Yapısal / yarı yapısal / kozmetik parça sınıfı', input.partStructuralClassKnown, 'warning'),
    pastDamageItem('vl-hasar-ayni-parca', 'Aynı parçada önceki hasar/onarım var mı?', input.samePartPreviousDamage),
    // v4: yapılandırılmış parça hazırlığı (SEİK katsayı çözümü için)
    (typeof input.structuredPartsCount === 'number' && input.structuredPartsCount > 0
      ? mk('vl-hasar-yapisal-liste', 'Yapılandırılmış parça listesi girildi mi?', 'ok', 'info')
      : mk('vl-hasar-yapisal-liste', 'Yapılandırılmış parça listesi girildi mi?', 'control_needed', 'warning', 'Parça bazlı satır girilmemiş; ön hesap için gerekli.')),
    boolItem('vl-hasar-katsayi-cozum', 'Parça katsayıları SEİK tablosundan çözüldü mü?', input.structuredPartsAllResolved, 'critical'),
    boolItem('vl-hasar-agirlik', 'Onarım ağırlıkları (hafif/orta/ağır) sınıflandı mı?', input.structuredSeverityAllKnown, 'warning'),
    boolItem('vl-hasar-boya-turu', 'Boya türleri (TAM/LOKAL) belli mi?', input.structuredPaintAllKnown, 'warning'),
    boolItem('vl-hasar-tutar', 'Hasar (onarım) tutarı girildi mi?', input.damageAmountEntered, 'critical'),
    // v5: yaş katsayısı kaynağı için hasar tarihi
    boolItem('vl-hasar-tarih', 'Hasar tarihi girildi mi? (yaş katsayısı kaynağı)', input.damageDateEntered, 'warning')
  ];

  const emsalOk = typeof input.comparableListingCount === 'number' && input.comparableListingCount >= 3;
  const piyasa: ValueLossChecklistItem[] = [
    (emsalOk
      ? mk('vl-piyasa-emsal', 'En az 3 emsal ilan var mı?', 'ok', 'info')
      : mk('vl-piyasa-emsal', 'En az 3 emsal ilan var mı?', 'missing', 'critical', 'Yeterli (≥3) emsal ilan girilmemiş.')),
    boolItem('vl-piyasa-guncel', 'İlanlar son 30 güne ait mi?', input.listingsWithin30Days, 'warning'),
    boolItem('vl-piyasa-ilanno', 'İlan numarası görünüyor mu?', input.listingIdsVisible, 'warning'),
    boolItem('vl-piyasa-ekran', 'Ekran görüntüleri alındı mı?', input.marketScreenshotsTaken, 'warning'),
    boolItem('vl-piyasa-benzerlik', 'Km / model / donanım benzerliği var mı?', input.listingSimilarityJustified, 'warning'),
    boolItem('vl-piyasa-outlier', 'Aşırı düşük/yüksek ilan dışlandı mı?', input.outliersExcluded, 'warning'),
    boolItem('vl-piyasa-gerceklik', 'Pazarlık payı / piyasa gerçekliği gerekçelendirildi mi?', input.marketRealityJustified, 'warning')
  ];

  const rapor: ValueLossChecklistItem[] = [
    boolItem('vl-rapor-modul', 'Hesap modülü çıktısı var mı?', input.calcModuleOutput, 'critical'),
    boolItem('vl-rapor-ekran', 'Piyasa analiz ekran görüntüleri var mı?', input.reportMarketScreenshots, 'warning'),
    boolItem('vl-rapor-foto', 'Fotoğraflar var mı?', input.photos, 'warning'),
    boolItem('vl-rapor-gerekce', 'Parça / onarım gerekçeleri var mı?', input.partRepairReasons, 'warning'),
    boolItem('vl-rapor-yontem', 'Yöntem raporda açıklanmış mı?', input.methodExplainedInReport, 'warning'),
    boolItem('vl-rapor-dijital', 'Hesaplama verileri dijital saklanacak mı?', input.dataStoredDigitally, 'info'),
    // v5: opsiyonel/denetim amaçlı — ASLA kritik değil
    (input.snapshotSaved === true
      ? mk('vl-rapor-onhesap-ozet', 'Ön hesap özeti kaydedildi mi? (opsiyonel)', 'ok', 'info')
      : mk('vl-rapor-onhesap-ozet', 'Ön hesap özeti kaydedildi mi? (opsiyonel)', 'control_needed', 'info', 'Opsiyoneldir; denetim izi için kullanıcı onayıyla kaydedilebilir.')),
    // v6: SEİK güncelleme izleme hatırlatması (yerel; otomatik internet kontrolü YAPILMAZ)
    mk('vl-rapor-seik-guncellik', 'SEİK katsayı seti güncelliği kontrol edilmeli', 'control_needed', 'info', 'SEİK yeni modül yayınladıysa katsayı seti elle yeniden doğrulanmalıdır (prosedür: docs/dev/SEIK_REVALIDATION_PROCEDURE.md); uygulama otomatik güncelleme/internet kontrolü yapmaz.'),
    // v8: kayıtlı özet tazeliği — ASLA kritik değil
    freshnessItem(input.snapshotFreshness),
    // v9: geçmiş kayıt tazeliği — ASLA kritik değil
    historyFreshnessItem(input.historyFreshness)
  ];

  return [
    { key: 'dosya', title: 'Dosya bilgisi', items: dosya },
    { key: 'arac', title: 'Araç bilgisi', items: arac },
    { key: 'hasar', title: 'Hasar bilgisi', items: hasar },
    { key: 'piyasa', title: 'Piyasa analizi', items: piyasa },
    { key: 'rapor', title: 'Rapor / evidence', items: rapor }
  ];
}

/** Kontrol listesi özet sayaçları (rozet/başlık için). */
export function summarizeValueLossChecklist(categories: readonly ValueLossChecklistCategory[]): ValueLossChecklistSummary {
  const all = categories.flatMap((c) => c.items);
  return {
    total: all.length,
    ok: all.filter((i) => i.status === 'ok').length,
    missing: all.filter((i) => i.status === 'missing').length,
    controlNeeded: all.filter((i) => i.status === 'control_needed').length,
    criticalMissing: all.filter((i) => i.status === 'missing' && i.severity === 'critical').length
  };
}

/** Eksik/kontrol gereken kritik+uyarı item etiketlerini (mail taslağı için) döner. */
export function missingChecklistLabels(categories: readonly ValueLossChecklistCategory[]): string[] {
  return categories
    .flatMap((c) => c.items)
    .filter((i) => (i.status === 'missing' || i.status === 'control_needed') && (i.severity === 'critical' || i.severity === 'warning'))
    .map((i) => i.label);
}
