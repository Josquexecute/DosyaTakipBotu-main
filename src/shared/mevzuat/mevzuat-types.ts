/**
 * v0.6.0 AI Bilgi Bankası — SEDDK mevzuat/genelge/tarife için SALT-OKUNUR yapısal tipler.
 *
 * Bu modül SAFTIR: ağ/dosya/electron/DOM kullanmaz; yalnızca sabit veri tipleri tanımlar.
 * Mevzuat bilgisi "eksper yardımcısı / kontrol bilgisi"dir; kesin hukuki karar yerine geçmez.
 *
 * Not: Mevcut `src/shared/knowledge/*` (kullanıcı içe-aktarım bilgi bankası) ayrı bir alt sistemdir.
 * SEDDK mevzuat seed'i çakışmayı ve karışıklığı önlemek için ayrı `mevzuat/` ad alanında tutulur.
 */

export type MevzuatTopic =
  | 'tanim'
  | 'atama'
  | 'is-kabul'
  | 'itiraz'
  | 'rapor'
  | 'sure'
  | 'on-rapor'
  | 'performans'
  | 'ucret'
  | 'sablon'
  | 'deger-kaybi'
  | 'agir-tam-hasar'
  | 'dosya-statu';

export type MevzuatConfidence = 'yuksek' | 'orta' | 'dusuk';

/** Belgenin metin katmanı doğrudan mı okundu yoksa görselden elle mi çıkarıldı. */
export type MevzuatReadability = 'pdf-metin' | 'gorsel-elle-cikarildi';

/** Tek bir mevzuat/genelge/tarife bilgi maddesi (salt-okunur referans). */
export interface MevzuatKnowledgeItem {
  id: string;
  sourceId: string;
  sourceTitle: string;
  /** Belge tarihi (ISO yyyy-mm-dd). */
  sourceDate: string;
  /** Yürürlük tarihi (ISO yyyy-mm-dd). */
  effectiveDate: string;
  topic: MevzuatTopic;
  tags: readonly string[];
  title: string;
  /** Kısa, tek cümlelik kural. */
  rule: string;
  /** Açıklama / ayrıntı. */
  detail: string;
  /** Madde/genelge atfı (ör. "Atama Yönetmeliği m.13"). */
  legalReference: string;
  /** Hangi AI yardımcısı/alan bu bilgiyi kullanabilir. */
  usageAreas: readonly string[];
  /** Eksper yardımcısı/kontrol uyarısı (kesin karar değildir). */
  caution: string;
  confidence: MevzuatConfidence;
}

/** Bir mevzuat kaynağı (yönetmelik/genelge/tarife) ve içindeki bilgi maddeleri. */
export interface MevzuatSource {
  id: string;
  title: string;
  sourceDate: string;
  effectiveDate: string;
  officialGazette?: string;
  circularNo?: string;
  readability: MevzuatReadability;
  tags: readonly string[];
  items: readonly MevzuatKnowledgeItem[];
}

/** Tüm mevzuat bilgisi için ortak gizlilik/sorumluluk notu. */
export const MEVZUAT_DISCLAIMER =
  'Bu mevzuat bilgileri eksper yardımcısı/kontrol amaçlıdır; kesin hukuki karar yerine geçmez. Nihai karar eksper onayına tabidir.';
