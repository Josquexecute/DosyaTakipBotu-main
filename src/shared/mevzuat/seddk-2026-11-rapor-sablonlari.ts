/**
 * SEDDK Genelge 2026/11 — Motorlu Araç Sigortalarında Kullanılacak Rapor Şablonlarına İlişkin Genelge
 * (Kurumdan 13.05.2026, yürürlük 01.07.2026). Kaynak: PDF metin katmanı. Salt-okunur referans.
 */
import type { MevzuatSource } from './mevzuat-types';

const SOURCE_ID = 'rapor-sablonlari-2026-11';
const SOURCE_TITLE = 'Motorlu Araç Sigortaları Kapsamında Kullanılacak Rapor Şablonlarına İlişkin Genelge';
const SOURCE_DATE = '2026-05-13';
const EFFECTIVE_DATE = '2026-07-01';

export const RAPOR_SABLONLARI_2026_11: MevzuatSource = {
  id: SOURCE_ID,
  title: SOURCE_TITLE,
  sourceDate: SOURCE_DATE,
  effectiveDate: EFFECTIVE_DATE,
  circularNo: '2026/11',
  readability: 'pdf-metin',
  tags: ['rapor şablonları', 'Ek-1.1', 'Ek-1.2', 'Ek-2', 'trafik raporu', 'ihtiyari mali sorumluluk', 'kasko raporu', 'değer kaybı', 'ağır hasar', 'tam hasar', 'rayiç', 'güvenlik parçaları', 'rapor alanları'],
  items: [
    {
      id: `${SOURCE_ID}-ek11`,
      sourceId: SOURCE_ID, sourceTitle: SOURCE_TITLE, sourceDate: SOURCE_DATE, effectiveDate: EFFECTIVE_DATE,
      topic: 'sablon', tags: ['Ek-1.1', 'değer kaybı', 'trafik', 'ihtiyari mali sorumluluk'],
      title: 'Ek-1.1 kullanımı (Değer Kaybı Dahil)',
      rule: 'Trafik veya ihtiyari mali sorumlulukta araç hasarı ile birlikte değer kaybı da değerlendirilecekse Ek-1.1 kullanılır.',
      detail: 'Ek-1.1, Oto Sorumluluk Sigortaları Ekspertiz Raporu Şablonu (Değer Kaybı Dahil)\'dir.',
      legalReference: 'Genelge 2026/11 m.4/4-6',
      usageAreas: ['rapor-sablonu-secici', 'deger-kaybi-yardimcisi'],
      caution: 'Şablon seçimi sigorta türü ve hasar niteliğine bağlıdır.',
      confidence: 'yuksek'
    },
    {
      id: `${SOURCE_ID}-ek12`,
      sourceId: SOURCE_ID, sourceTitle: SOURCE_TITLE, sourceDate: SOURCE_DATE, effectiveDate: EFFECTIVE_DATE,
      topic: 'sablon', tags: ['Ek-1.2', 'ağır hasar', 'tam hasar'],
      title: 'Ek-1.2 kullanımı (Değer Kaybı Hariç)',
      rule: 'Trafikte eksper tam/ağır hasar tespit ederse veya ihtiyari mali sorumlulukta yalnızca araç hasarı tespit edilecekse Ek-1.2 kullanılır.',
      detail: 'Ek-1.2, Oto Sorumluluk Sigortaları Ekspertiz Raporu Şablonu (Değer Kaybı Hariç)\'dir.',
      legalReference: 'Genelge 2026/11 m.4/5-6',
      usageAreas: ['rapor-sablonu-secici', 'agir-tam-hasar-yardimcisi'],
      caution: 'Tam/ağır hasarda değer kaybı hesaplanmaz.',
      confidence: 'yuksek'
    },
    {
      id: `${SOURCE_ID}-ek2`,
      sourceId: SOURCE_ID, sourceTitle: SOURCE_TITLE, sourceDate: SOURCE_DATE, effectiveDate: EFFECTIVE_DATE,
      topic: 'sablon', tags: ['Ek-2', 'kasko raporu'],
      title: 'Ek-2 kullanımı (Kasko)',
      rule: 'Kara araçları kasko sigortası dosyalarında Ek-2 şablonu kullanılır.',
      detail: 'Ek-2, Kara Araçları Kasko Sigortası Ekspertiz Raporu Şablonu\'dur; muafiyet tenzili ve kıymet kazanma tenzili gibi kasko\'ya özgü alanlar içerir.',
      legalReference: 'Genelge 2026/11 Ek-2',
      usageAreas: ['rapor-sablonu-secici'],
      caution: 'Kasko hesap özetinde kıymet kazanma ve muafiyet tenzili kalemleri yer alır.',
      confidence: 'yuksek'
    },
    {
      id: `${SOURCE_ID}-agir-tam-alanlar`,
      sourceId: SOURCE_ID, sourceTitle: SOURCE_TITLE, sourceDate: SOURCE_DATE, effectiveDate: EFFECTIVE_DATE,
      topic: 'agir-tam-hasar', tags: ['ağır hasar', 'tam hasar', 'rayiç', 'güvenlik parçaları'],
      title: 'Ağır/tam hasar rapor alanları',
      rule: 'Ağır/tam hasar bölümünde piyasa rayiç bedeli, Onarım Tutarı/Rayiç Bedel (%) ve hasar gören güvenlik parçaları (isim/adet) yer alır.',
      detail: 'Karar; (onarım masrafları/rayiç bedel) oranının aşılması veya temel kritik parçaların zarar görmesi ile İcra Komitesi esaslarına göre verilir.',
      legalReference: 'Genelge 2026/11 - Ek-1.2/Ek-2 ağır-tam hasar bölümü',
      usageAreas: ['agir-tam-hasar-yardimcisi', 'evrak-kontrol-yardimcisi'],
      caution: 'Kesin oran eşiği belgede sayısal verilmemiştir; eksper kanaati gerekir.',
      confidence: 'yuksek'
    },
    {
      id: `${SOURCE_ID}-deger-kaybi-yontem`,
      sourceId: SOURCE_ID, sourceTitle: SOURCE_TITLE, sourceDate: SOURCE_DATE, effectiveDate: EFFECTIVE_DATE,
      topic: 'deger-kaybi', tags: ['değer kaybı', 'rapor alanları'],
      title: 'Değer kaybı hesap yöntemi (rapor alanları)',
      rule: 'Değer kaybı, gerçek zarar ilkesiyle; kaza öncesi ikinci el değeri ile onarım sonrası ikinci el değeri arasındaki fark yöntemiyle hesaplanır.',
      detail: 'Yıpranma payı (km, korozyon, geçmiş hasar), hasar bölgeleri, parça niteliği ve piyasa araştırması (bayi/galeri/online ilan, ekran görüntüsü) raporda istenir.',
      legalReference: 'Genelge 2026/11 - Ek-1.1 değer kaybı bölümü',
      usageAreas: ['deger-kaybi-yardimcisi'],
      caution: 'Hesap eksper takdirindedir; HasarBotu yalnız girdi/kontrol sağlar.',
      confidence: 'yuksek'
    }
  ]
};
