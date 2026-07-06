/**
 * SEDDK — Sigorta Eksperleri Atama Yönetmeliği (RG 12.02.2026 / 33166, yürürlük 01.04.2026).
 * Kaynak okunabilirliği: PDF metin katmanından okundu. Salt-okunur referans verisi.
 */
import type { MevzuatSource } from './mevzuat-types';

const SOURCE_ID = 'atama-yonetmeligi-2026';
const SOURCE_TITLE = 'Sigorta Eksperleri Atama Yönetmeliği';
const SOURCE_DATE = '2026-02-12';
const EFFECTIVE_DATE = '2026-04-01';

export const ATAMA_YONETMELIGI_2026: MevzuatSource = {
  id: SOURCE_ID,
  title: SOURCE_TITLE,
  sourceDate: SOURCE_DATE,
  effectiveDate: EFFECTIVE_DATE,
  officialGazette: '33166',
  readability: 'pdf-metin',
  tags: ['EKSİST', 'atama', 'iş kabul', 'itiraz', 'hakem eksper', 'rapor', 'ücret', 'brüt hasar', 'ağır hasar', 'tam hasar'],
  items: [
    {
      id: `${SOURCE_ID}-eksist-tanim`,
      sourceId: SOURCE_ID, sourceTitle: SOURCE_TITLE, sourceDate: SOURCE_DATE, effectiveDate: EFFECTIVE_DATE,
      topic: 'tanim', tags: ['EKSİST', 'tanım'],
      title: 'EKSİST tanımı',
      rule: 'EKSİST, Kurumca usul ve esasları belirlenen Eksper Atama ve Takip Sistemidir.',
      detail: 'Eksper talep, atama ve takip işlemleri EKSİST üzerinden yürütülür. Merkez = Sigorta Bilgi ve Gözetim Merkezi; Kurum = SEDDK; İcra Komitesi = TOBB nezdindeki Sigorta Eksperleri İcra Komitesi.',
      legalReference: 'Atama Yönetmeliği m.3',
      usageAreas: ['atama-yardimcisi'],
      caution: 'Tanım bilgisidir; işlem akışı için 2026/7 Genelge esas alınmalıdır.',
      confidence: 'yuksek'
    },
    {
      id: `${SOURCE_ID}-trafik-atama-sirali`,
      sourceId: SOURCE_ID, sourceTitle: SOURCE_TITLE, sourceDate: SOURCE_DATE, effectiveDate: EFFECTIVE_DATE,
      topic: 'atama', tags: ['atama', 'trafik', 'EKSİST'],
      title: 'Trafik sigortasında atama EKSİST sıralı',
      rule: 'Trafik sigortasında eksper ataması EKSİST üzerinden sıralı yapılır.',
      detail: 'Trafik sigortasında atanacak eksper EKSİST sıralı atama ile belirlenir.',
      legalReference: 'Atama Yönetmeliği m.6/1',
      usageAreas: ['atama-yardimcisi'],
      caution: 'Atamanın zorunlu olup olmaması bakımından ayrıntı 2026/7 Genelge\'dedir.',
      confidence: 'yuksek'
    },
    {
      id: `${SOURCE_ID}-trafik-zorunlu-esik`,
      sourceId: SOURCE_ID, sourceTitle: SOURCE_TITLE, sourceDate: SOURCE_DATE, effectiveDate: EFFECTIVE_DATE,
      topic: 'atama', tags: ['trafik', 'zorunlu', 'eşik'],
      title: 'Trafikte eksper tespiti zorunluluk eşiği',
      rule: 'Muallak/ilk inceleme tutarı asgari maddi teminatın 1/10\'unu aşarsa hasar tespiti eksperce zorunludur.',
      detail: 'Kurum bu oranı sıfıra kadar indirmeye veya iki katına çıkarmaya yetkilidir.',
      legalReference: 'Atama Yönetmeliği m.6/2',
      usageAreas: ['atama-yardimcisi'],
      caution: 'Oran Kurumca değiştirilebilir; güncel oran kontrol edilmelidir.',
      confidence: 'yuksek'
    },
    {
      id: `${SOURCE_ID}-kasko-agir-tam-zorunlu`,
      sourceId: SOURCE_ID, sourceTitle: SOURCE_TITLE, sourceDate: SOURCE_DATE, effectiveDate: EFFECTIVE_DATE,
      topic: 'agir-tam-hasar', tags: ['kasko', 'ağır hasar', 'tam hasar', 'atama'],
      title: 'Kaskoda ağır/tam hasar tespitinde eksper zorunlu',
      rule: 'Kara araçları kaskosunda tutar ağır/tam hasar kararı gerektiriyorsa tespit EKSİST sıralı eksperce yapılır.',
      detail: 'Ağır ve tam hasar dışındaki kasko atama süreç ve kriterleri Kurumca belirlenir.',
      legalReference: 'Atama Yönetmeliği m.6/5',
      usageAreas: ['atama-yardimcisi', 'agir-tam-hasar-yardimcisi'],
      caution: 'Ağır/tam hasar kararı İcra Komitesi esaslarına göre verilir; eksper kanaati gerekir.',
      confidence: 'yuksek'
    },
    {
      id: `${SOURCE_ID}-deger-kaybi-ayni-rapor`,
      sourceId: SOURCE_ID, sourceTitle: SOURCE_TITLE, sourceDate: SOURCE_DATE, effectiveDate: EFFECTIVE_DATE,
      topic: 'deger-kaybi', tags: ['değer kaybı', 'gerçek zarar', 'rapor'],
      title: 'Değer kaybı aynı raporda gerçek zarar ilkesiyle',
      rule: 'Atanan eksper, değer kaybı tazminatını gerçek zarar ilkesi gözetilerek aynı raporda hesaplar.',
      detail: 'Değer kaybına ilişkin atama süreç/kriter ve iş kabulü gibi hususlar Kurumca belirlenir.',
      legalReference: 'Atama Yönetmeliği m.6/3-4',
      usageAreas: ['deger-kaybi-yardimcisi', 'rapor-sablonu-secici'],
      caution: 'Hesap eksper takdirindedir; piyasa araştırması ve gerçek zarar ilkesi gereklidir.',
      confidence: 'yuksek'
    },
    {
      id: `${SOURCE_ID}-is-kabul-6-saat`,
      sourceId: SOURCE_ID, sourceTitle: SOURCE_TITLE, sourceDate: SOURCE_DATE, effectiveDate: EFFECTIVE_DATE,
      topic: 'is-kabul', tags: ['iş kabul', '6 saat', 'EKSİST'],
      title: 'İş kabulü 6 saat',
      rule: 'Atama bildiriminden itibaren en geç 6 saat içinde EKSİST\'te kabul/ret bildirilir; bildirilmezse kabul edilmiş sayılır.',
      detail: 'Eksper işi reddederse ilk atama usulüne göre yeniden atama yapılır.',
      legalReference: 'Atama Yönetmeliği m.13',
      usageAreas: ['sure-takip-yardimcisi', 'atama-yardimcisi'],
      caution: 'Süre kaçırılırsa otomatik kabul doğar; sayaç takibi önemlidir.',
      confidence: 'yuksek'
    },
    {
      id: `${SOURCE_ID}-itiraz-hakem`,
      sourceId: SOURCE_ID, sourceTitle: SOURCE_TITLE, sourceDate: SOURCE_DATE, effectiveDate: EFFECTIVE_DATE,
      topic: 'itiraz', tags: ['itiraz', 'hakem eksper'],
      title: 'İtiraz süreci ve hakem eksper',
      rule: 'Tespitlere 3 iş günü içinde itiraz edilebilir; hakem eksper EKSİST\'ten (≥10 yıl deneyim) atanır ve raporu nihaidir.',
      detail: 'İtiraz/hakem eksperi motorlu araç sigortalarında 3 iş günü, diğer branşlarda 10 iş günü içinde rapor hazırlar.',
      legalReference: 'Atama Yönetmeliği m.8',
      usageAreas: ['sure-takip-yardimcisi'],
      caution: 'Bu süreler itiraz/hakem süreçlerine aittir; ilk eksperin normal rapor süreleri 2026/7 Genelge\'dedir.',
      confidence: 'yuksek'
    },
    {
      id: `${SOURCE_ID}-rapor-merkez-sistemi`,
      sourceId: SOURCE_ID, sourceTitle: SOURCE_TITLE, sourceDate: SOURCE_DATE, effectiveDate: EFFECTIVE_DATE,
      topic: 'rapor', tags: ['rapor', 'e-imza', 'Merkez'],
      title: 'Raporlar Merkez sistemi üzerinden ve e-imzalı',
      rule: 'Eksper raporları Merkez nezdindeki rapor yazım sistemi üzerinden güvenli elektronik imza ile düzenlenir.',
      detail: 'Raporun düzenlenmesi esnasında ekspere hiçbir surette müdahale edilemez.',
      legalReference: 'Atama Yönetmeliği m.11',
      usageAreas: ['rapor-sablonu-secici', 'evrak-kontrol-yardimcisi'],
      caution: 'Geçiş döneminde farklı yazım sistemleri için Geçici m.2 hükümleri uygulanır.',
      confidence: 'yuksek'
    },
    {
      id: `${SOURCE_ID}-ucret-brut-hasar`,
      sourceId: SOURCE_ID, sourceTitle: SOURCE_TITLE, sourceDate: SOURCE_DATE, effectiveDate: EFFECTIVE_DATE,
      topic: 'ucret', tags: ['ücret', 'brüt hasar', 'taban tarife'],
      title: 'Ücret ve brüt hasar tutarı',
      rule: 'Ekspertiz ücreti taban tarifeden az olamaz; ücrete baz brüt hasar tutarı koasürans/sovtaj/eksik sigorta/muafiyet öncesi tutardır.',
      detail: 'İlk rapor ücreti sigorta şirketince ödenir; ulaşım/konaklama eklenir; dövizli poliçede rapor tarihli TCMB satış kuru baz alınır. Taban tarife EK-1 ve EK-2 ile belirlenir, her yıl başı TÜFE ile artar.',
      legalReference: 'Atama Yönetmeliği m.14-15',
      usageAreas: ['ekspertiz-ucreti-hesap-yardimcisi'],
      caution: 'Taban tarifenin altına inilemez; rakamlar EK-1/EK-2 tarifesindedir.',
      confidence: 'yuksek'
    },
    {
      id: `${SOURCE_ID}-yururluk-pilot`,
      sourceId: SOURCE_ID, sourceTitle: SOURCE_TITLE, sourceDate: SOURCE_DATE, effectiveDate: EFFECTIVE_DATE,
      topic: 'atama', tags: ['yürürlük', 'pilot'],
      title: 'Yürürlük ve pilot uygulama',
      rule: 'Yönetmelik 01.04.2026\'da yürürlüğe girer; sıralı atama pilotu Bursa ve Ordu illerinde 3 ay uygulanır.',
      detail: '25/8/2015 tarihli eski Atama Yönetmeliği yürürlükten kaldırılmıştır. Pilot tamamlanıncaya kadar pilot dışı illerde eski hükümler uygulanır.',
      legalReference: 'Atama Yönetmeliği m.17-18, Geçici m.3',
      usageAreas: ['atama-yardimcisi'],
      caution: 'Pilot kapsamı Kurulca değiştirilebilir/uzatılabilir.',
      confidence: 'yuksek'
    }
  ]
};
