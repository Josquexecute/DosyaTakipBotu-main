/**
 * v0.6.x — AI Değer Kaybı Yardımcısı v1: iç not / rapor açıklama / eksik bilgi mail taslakları.
 * SAF (ağ/dosya/electron/DOM yok). Yalnız metin üretir; hiçbir taslak otomatik gönderilmez/kaydedilmez.
 * Taslaklar kesin tutar/hüküm sunmaz; eksper kanaati ve hesaplama gerekçesi vurgulanır.
 */

export type ValueLossDraftKind = 'internal_note' | 'report_explanation' | 'missing_info_mail';

export interface ValueLossDraft {
  kind: ValueLossDraftKind;
  title: string;
  body: string;
}

/**
 * v2: Ek Bilgi Formu'ndan türetilen gerçekler; taslak metnini GÜÇLENDİRİR (yalnız ekleme).
 * Verilmezse v1 taslak metinleri aynen korunur. Tutar üretilmez.
 */
export interface ValueLossDraftFacts {
  hasMarketValue?: boolean;
  comparableListingCount?: number;
  sbmChecked?: boolean;
  heavyDamage?: boolean;
  /** v3: Reel piyasa analiz ön hesabı 'calculated' döndüyse true (tutar taslağa YAZILMAZ). */
  calculationPossible?: boolean;
  /** v4: yapılandırılmış parça listesi girildiyse true (yalnız nitelik cümlesi; tutar yazılmaz). */
  structuredPartsClassified?: boolean;
  /** v5: araç türü + hasar tarihi girildiyse true (nitelik cümlesi). */
  vehicleContextChecked?: boolean;
  /** v5: kullanıcı onaylı ön hesap özeti kayıtlıysa true (nitelik cümlesi; tutar yazılmaz). */
  snapshotSaved?: boolean;
  /** v6: kayıtlı özetin durumu (nitelik cümlesi seçimi için; tutar ASLA yazılmaz). */
  snapshotStatus?: 'calculated' | 'cannot_calculate' | 'control_needed';
  /** v8: kayıtlı özetin tazelik durumu (nitelik cümlesi; tutar/hüküm yazılmaz). */
  snapshotFreshness?: 'fresh' | 'stale' | 'unknown' | 'none';
  /** v9: geçmişte eski/bilinmeyen veri sürümlü kayıt varsa true (yalnız nitelik cümlesi). */
  historyHasStaleOrUnknown?: boolean;
}

const HEAVY_DAMAGE_NOTE = 'Dosyada ağır/tam hasar göstergesi bulunduğundan değer kaybı yönünden özel kontrol yapılması gerekmektedir.';

/** Form verisine göre taslağa eklenecek destek cümleleri (yoksa boş). */
function factSentences(facts: ValueLossDraftFacts | undefined): string[] {
  if (!facts) return [];
  const out: string[] = [];
  if (facts.hasMarketValue === true) out.push('Araç rayiç bilgisi dikkate alınmıştır.');
  if (typeof facts.comparableListingCount === 'number' && facts.comparableListingCount >= 3) out.push('En az üç emsal ilan verisi analize dahil edilmiştir.');
  if (facts.sbmChecked === true) out.push('SBM geçmiş hasar bilgileri kontrol edilmiştir.');
  if (facts.heavyDamage === true) out.push(HEAVY_DAMAGE_NOTE);
  if (facts.structuredPartsClassified === true) {
    out.push('Hasar gören parçalar değişim, onarım ve boya işlemi yönünden ayrı ayrı sınıflandırılmış; onarılan parçalar için işçilik/yeni parça fiyatı oranı dikkate alınarak onarım ağırlığı değerlendirilmiştir.');
  }
  if (facts.vehicleContextChecked === true) {
    out.push('Araç türü ve hasar tarihi bilgileri değer kaybı ön değerlendirmesinde ayrıca kontrol edilmiştir.');
  }
  if (facts.snapshotSaved === true) {
    out.push('Ön hesap özeti kullanıcı onayıyla dosya bağlamına kaydedilmiştir.');
    out.push('Kullanıcı onayıyla kaydedilmiş ön hesap özeti dosya bağlamında referans olarak bulunmaktadır.');
    // v7: duruma özel NİTELİK cümleleri (tutar/yuvarlanmış tutar ASLA yazılmaz).
    if (facts.snapshotStatus === 'calculated') {
      out.push('Kaydedilen ön hesap özeti, girilen verilerle hesap yapılabilir durumda olduğunu göstermektedir. Nihai değerlendirme eksper kanaati, dosya kapsamı ve piyasa verileriyle birlikte yapılmalıdır.');
    } else if (facts.snapshotStatus === 'control_needed') {
      out.push('Kaydedilen ön hesap özeti tanı amaçlıdır; bazı veriler kontrol gerektirdiğinden ödenebilir tutar sonucu oluşturulmamıştır.');
    } else if (facts.snapshotStatus === 'cannot_calculate') {
      out.push('Kaydedilen ön hesap özeti tanı amaçlıdır; zorunlu veri eksikleri nedeniyle tutar hesaplanmamıştır.');
    }
    // v8: tazelik nitelik cümlesi (kayıtlı özetin güncel form verisiyle uyumu)
    if (facts.snapshotFreshness === 'fresh') {
      out.push('Kayıtlı ön hesap özeti mevcut form verileriyle aynı veri sürümüne aittir.');
    } else if (facts.snapshotFreshness === 'stale') {
      out.push('Kayıtlı ön hesap özeti önceki form verilerine ait olabilir; güncel değerlendirme için ön hesabın yenilenmesi önerilir.');
    } else if (facts.snapshotFreshness === 'unknown') {
      out.push('Kayıtlı ön hesap özetinin veri sürümü bilinmemektedir; güncel değerlendirme için kontrol edilmelidir.');
    }
    // v9: geçmişte eski/bilinmeyen veri sürümlü kayıt varsa yalnız nitelik uyarısı (gürültü değil)
    if (facts.historyHasStaleOrUnknown === true) {
      out.push('Ön hesap geçmişinde mevcut form verileriyle aynı veri sürümüne ait olmayabilecek kayıtlar bulunduğundan, güncel değerlendirme için en son kayıtlı özet esas alınmalı ve gerekirse ön hesap yenilenmelidir.');
    }
  }
  if (facts.calculationPossible === true) {
    out.push('Girilen veriler üzerinden yapılan ön değerlendirmede, reel piyasa analiz yöntemine göre değer kaybı yönünden hesaplama yapılabilir durumda olduğu görülmüştür. Hesap; araç rayiç değeri, kilometre/model yılı, geçmiş hasar bilgisi, piyasa emsal verileri ve hasar gören parça niteliği birlikte değerlendirilerek oluşturulmalıdır.');
  }
  return out;
}

/** Eksik bilgi mailinde varsayılan olarak istenecek kalemler. */
export const VALUE_LOSS_DEFAULT_MISSING_ITEMS: readonly string[] = [
  'Araç güncel rayiç bilgisi',
  'Kilometre bilgisi',
  'SBM geçmiş hasar bilgisi',
  'Değişen/onarılan/boyanan parça listesi',
  'Onarım işçilik ve parça bedelleri',
  'Reel piyasa analizine esas emsal ilanlar'
];

/** Dosya içi kısa not taslağı (form verisi varsa ağır/tam hasar özel kontrol notu eklenir). */
export function buildValueLossInternalNote(facts?: ValueLossDraftFacts): ValueLossDraft {
  const base = '01.07.2026 sonrası trafik dosyası olması nedeniyle hasar tespiti ile birlikte değer kaybı yönünden de değerlendirme yapılması gerekmektedir. Değer kaybı hesabı reel piyasa analiz yöntemi, araç rayiç bilgisi, hasarlı parça sınıflandırması, geçmiş hasar bilgisi ve emsal ilan verileri dikkate alınarak kontrol edilmelidir.';
  const heavy = facts?.heavyDamage === true ? ` ${HEAVY_DAMAGE_NOTE}` : '';
  return { kind: 'internal_note', title: 'İç not taslağı', body: `${base}${heavy}` };
}

/** Rapora eklenebilecek teknik açıklama taslağı (form verisi destek cümleleriyle güçlenir). */
export function buildValueLossReportExplanation(facts?: ValueLossDraftFacts): ValueLossDraft {
  const base = 'Değer kaybı yönünden yapılan değerlendirmede, aracın kaza öncesi hasarsız ikinci el piyasa rayici ile onarım sonrası piyasa değeri arasındaki farkın tespiti esas alınmıştır. Hesaplamada reel piyasa analiz yöntemi, araç rayiç verileri, kilometre/model yılı, hasar gören parça niteliği, değişim/onarım/boya durumu, geçmiş hasar bilgileri ve emsal piyasa ilanları birlikte değerlendirilmiştir.';
  const extra = factSentences(facts);
  return {
    kind: 'report_explanation',
    title: 'Rapor açıklama taslağı',
    body: extra.length > 0 ? `${base} ${extra.join(' ')}` : base
  };
}

function normalizeMissing(missing?: readonly string[]): readonly string[] {
  if (!missing) return VALUE_LOSS_DEFAULT_MISSING_ITEMS;
  const cleaned = missing.map((m) => String(m).trim()).filter((m) => m.length > 0);
  return cleaned.length > 0 ? cleaned : VALUE_LOSS_DEFAULT_MISSING_ITEMS;
}

/** Dosya sorumlusuna gönderilebilecek eksik bilgi mail taslağı (opsiyonel özel liste). */
export function buildValueLossMissingInfoMail(missing?: readonly string[]): ValueLossDraft {
  const items = normalizeMissing(missing).map((m) => `- ${m}`).join('\n');
  const body = [
    'Merhaba,',
    '',
    '01.07.2026 sonrası trafik dosyalarında hasar tespiti ile birlikte değer kaybı değerlendirmesine de raporda yer verilmesi gerektiğinden, değer kaybı hesabı için aşağıdaki bilgilerin tamamlanması gerekmektedir:',
    '',
    items,
    '',
    'Bilgilerin tamamlanmasını rica ederiz.',
    '',
    'Saygılarımla,'
  ].join('\n');
  return { kind: 'missing_info_mail', title: 'Eksik bilgi mail taslağı', body };
}

/** Tek giriş noktası: taslak türüne göre uygun taslağı üretir (facts opsiyonel; yalnız güçlendirir). */
export function buildValueLossDraft(kind: ValueLossDraftKind, missing?: readonly string[], facts?: ValueLossDraftFacts): ValueLossDraft {
  if (kind === 'report_explanation') return buildValueLossReportExplanation(facts);
  if (kind === 'missing_info_mail') return buildValueLossMissingInfoMail(missing);
  return buildValueLossInternalNote(facts);
}
