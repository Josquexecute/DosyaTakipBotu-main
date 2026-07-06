/**
 * SEDDK — Atama Yönetmeliği Ekleri / Taban Ekspertiz Ücret Tarifeleri (EK-1, EK-2; yürürlük 01.04.2026).
 * Kaynak okunabilirliği: görsel PDF'ten ELLE çıkarıldı (kullanıcı tarafından doğrulandı). Salt-okunur referans.
 *
 * NOT: Buradaki maddeler insan-okur ÖZET kurallardır. Sayısal hesap, saf `src/shared/fees/*` modülündedir.
 */
import type { MevzuatSource } from './mevzuat-types';

const SOURCE_ID = 'ucret-tarifeleri-2026';
const SOURCE_TITLE = 'Taban Ekspertiz Ücret Tarifeleri (EK-1 / EK-2)';
const SOURCE_DATE = '2026-02-12';
const EFFECTIVE_DATE = '2026-04-01';

export const UCRET_TARIFELERI_2026: MevzuatSource = {
  id: SOURCE_ID,
  title: SOURCE_TITLE,
  sourceDate: SOURCE_DATE,
  effectiveDate: EFFECTIVE_DATE,
  readability: 'gorsel-elle-cikarildi',
  tags: ['EK-1 motorlu araç ücret tarifesi', 'EK-2 motorlu araç dışı ücret tarifesi', 'binek / hafif ticari / motosiklet', 'ağır vasıta %50', 'iş makinesi %120', 'değer kaybı 1.450 TL', 'KTT tanzim 2.100 TL', 'uzaktan ekspertiz 2/3', 'değer tespiti 2/3', 'şehir dışı %25', 'KDV hariç', 'yol masrafı formülü'],
  items: [
    {
      id: `${SOURCE_ID}-ek1-kademeler`,
      sourceId: SOURCE_ID, sourceTitle: SOURCE_TITLE, sourceDate: SOURCE_DATE, effectiveDate: EFFECTIVE_DATE,
      topic: 'ucret', tags: ['EK-1 motorlu araç ücret tarifesi', 'binek / hafif ticari / motosiklet', 'KDV hariç'],
      title: 'EK-1 motorlu araç ücret kademeleri',
      rule: 'Binek/hafif ticari/motosiklet için 6 kademeli taban tarife (KDV hariç): 1. kademede 2.400 TL, 6. kademede 21.659,93 TL sabit.',
      detail: 'Ara kademelerde sabit taban + (brüt hasar − kademe alt sınırı) × marjinal oran ile hesaplanır. Sayısal hesap fees modülündedir.',
      legalReference: 'EK-1',
      usageAreas: ['ekspertiz-ucreti-hesap-yardimcisi'],
      caution: 'Ücret brüt hasar (kesinti öncesi) üzerinden ve KDV hariçtir.',
      confidence: 'yuksek'
    },
    {
      id: `${SOURCE_ID}-ek1-carpanlar`,
      sourceId: SOURCE_ID, sourceTitle: SOURCE_TITLE, sourceDate: SOURCE_DATE, effectiveDate: EFFECTIVE_DATE,
      topic: 'ucret', tags: ['ağır vasıta %50', 'iş makinesi %120'],
      title: 'EK-1 araç grubu çarpanları',
      rule: 'Ağır vasıta asgari ücreti binek hesabının %50 fazlası (×1,50); iş makinesi %120 fazlası (×2,20)\'dır.',
      detail: '%100 elektrikli araçlarda ait olduğu vasıta grubunun tarifesi uygulanır.',
      legalReference: 'EK-1',
      usageAreas: ['ekspertiz-ucreti-hesap-yardimcisi'],
      caution: 'Araç sınıfı doğru belirlenmelidir.',
      confidence: 'yuksek'
    },
    {
      id: `${SOURCE_ID}-ek1-ek-kurallar`,
      sourceId: SOURCE_ID, sourceTitle: SOURCE_TITLE, sourceDate: SOURCE_DATE, effectiveDate: EFFECTIVE_DATE,
      topic: 'ucret', tags: ['değer kaybı 1.450 TL', 'maddi hasarla birlikte değer kaybı %50', 'KTT tanzim 2.100 TL', 'uzaktan ekspertiz 2/3', 'değer tespiti 2/3', 'şehir dışı %25'],
      title: 'EK-1 ek ücret kuralları',
      rule: 'Değer kaybı 1.450 TL (maddi hasarla birlikte %50 = 725 TL); KTT tanzim 2.100 TL; uzaktan ekspertiz ve değer tespiti temel ücretin 2/3\'ü; şehir dışı %25 ilave.',
      detail: 'Yol masrafı (>50 km): km × 7/100 × EPDK akaryakıt fiyatı × 1,3 / dosya sayısı + otoyol + köprü + feribot + otopark.',
      legalReference: 'EK-1 ek kurallar',
      usageAreas: ['ekspertiz-ucreti-hesap-yardimcisi'],
      caution: 'EPDK fiyatı yoksa yol masrafı hesaplanmaz; eksik girdi olarak işaretlenir.',
      confidence: 'yuksek'
    },
    {
      id: `${SOURCE_ID}-ek2-kademeler`,
      sourceId: SOURCE_ID, sourceTitle: SOURCE_TITLE, sourceDate: SOURCE_DATE, effectiveDate: EFFECTIVE_DATE,
      topic: 'ucret', tags: ['EK-2 motorlu araç dışı ücret tarifesi', 'KDV hariç'],
      title: 'EK-2 motorlu araç dışı ücret kademeleri',
      rule: 'Sivil rizikolar için 7 kademeli taban tarife (KDV hariç): 1. kademede 3.000 TL; 7. kademede 94.193,20 TL\'den az olmamak üzere mutabakatla.',
      detail: 'Ticari/sınai/endüstriyel rizikolarda sivil hesabın %50 fazlası; uzaktan 2/3; şehir dışı 6. kademeye kadar (6. hariç) %25. DASK ve maden çalışanları zorunlu ferdi kaza risk incelemesi kapsam dışıdır.',
      legalReference: 'EK-2',
      usageAreas: ['ekspertiz-ucreti-hesap-yardimcisi'],
      caution: 'HasarBotu motorlu araç odaklıdır; EK-2 referans bilgidir.',
      confidence: 'yuksek'
    }
  ]
};
