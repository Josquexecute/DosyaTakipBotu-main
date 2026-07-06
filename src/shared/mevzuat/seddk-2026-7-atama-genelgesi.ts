/**
 * SEDDK Genelge 2026/7 — Atama Yönetmeliğinin Uygulanmasına İlişkin Genelge (31.03.2026, yürürlük 01.04.2026).
 * Kaynak okunabilirliği: görsel PDF'ten ELLE çıkarıldı (kullanıcı tarafından doğrulandı). Salt-okunur referans.
 */
import type { MevzuatSource } from './mevzuat-types';

const SOURCE_ID = 'atama-genelgesi-2026-7';
const SOURCE_TITLE = 'Sigorta Eksperleri Atama Yönetmeliğinin Uygulanmasına İlişkin Genelge';
const SOURCE_DATE = '2026-03-31';
const EFFECTIVE_DATE = '2026-04-01';

export const ATAMA_GENELGESI_2026_7: MevzuatSource = {
  id: SOURCE_ID,
  title: SOURCE_TITLE,
  sourceDate: SOURCE_DATE,
  effectiveDate: EFFECTIVE_DATE,
  circularNo: '2026/7',
  readability: 'gorsel-elle-cikarildi',
  tags: ['atama saatleri', 'iş kabul', 'ön rapor', '15 gün', '30 gün', 'performans', 'dosya statüleri', 'liste'],
  items: [
    {
      id: `${SOURCE_ID}-atama-saatleri`,
      sourceId: SOURCE_ID, sourceTitle: SOURCE_TITLE, sourceDate: SOURCE_DATE, effectiveDate: EFFECTIVE_DATE,
      topic: 'atama', tags: ['atama saatleri', 'tatil'],
      title: 'Atama saatleri (günde 4 kez)',
      rule: 'Atamalar günde 4 kez yapılır: 09:00, 11:00, 13:00 ve 16:00. Hafta sonu ve resmî tatilde atama yapılmaz.',
      detail: 'Hafta sonu/resmî tatil sonrası atamalar ilk atama zamanında yapılır.',
      legalReference: 'Genelge 2026/7 - Atama',
      usageAreas: ['atama-yardimcisi', 'sure-takip-yardimcisi'],
      caution: 'Bir sonraki atama penceresi bu saatlere göre belirlenir.',
      confidence: 'yuksek'
    },
    {
      id: `${SOURCE_ID}-sirket-1-is-gunu`,
      sourceId: SOURCE_ID, sourceTitle: SOURCE_TITLE, sourceDate: SOURCE_DATE, effectiveDate: EFFECTIVE_DATE,
      topic: 'atama', tags: ['belgeler tamamlandıktan sonra 1 iş günü atama'],
      title: 'Şirket ataması 1 iş günü',
      rule: 'Sigorta şirketi, ilgili belgelerin tamamlanmasını takiben 1 iş günü içinde atama yapar.',
      detail: 'Şirket süresinde atamazsa; sigortalı, sigorta ettiren, şirket veya menfaat sahibi atama yapabilir. Zaten atanmış eksper varsa başka eksper atanamaz.',
      legalReference: 'Genelge 2026/7 - Atama',
      usageAreas: ['atama-yardimcisi', 'sure-takip-yardimcisi'],
      caution: 'Atanmış eksper varken yeni atama engellidir.',
      confidence: 'yuksek'
    },
    {
      id: `${SOURCE_ID}-ayni-servis-10-dosya`,
      sourceId: SOURCE_ID, sourceTitle: SOURCE_TITLE, sourceDate: SOURCE_DATE, effectiveDate: EFFECTIVE_DATE,
      topic: 'atama', tags: ['aynı servis', '10 dosya'],
      title: 'Aynı serviste günlük 10 dosya kuralı',
      rule: 'Aynı onarım servisine yönlendirilen birden fazla hasarda, aynı gün en fazla 10 dosyaya ilk görevlendirilen eksper atanır.',
      detail: 'Aynı servise gün içinde 10 dosyadan fazlası için ilk eksper otomatik atanmaz.',
      legalReference: 'Genelge 2026/7 - Atama',
      usageAreas: ['atama-yardimcisi'],
      caution: 'Servis bazlı yığılmayı önleme kuralıdır.',
      confidence: 'yuksek'
    },
    {
      id: `${SOURCE_ID}-is-kabul-ret`,
      sourceId: SOURCE_ID, sourceTitle: SOURCE_TITLE, sourceDate: SOURCE_DATE, effectiveDate: EFFECTIVE_DATE,
      topic: 'is-kabul', tags: ['iş kabul 6 saat'],
      title: 'İş kabulü ve ret zinciri',
      rule: 'İş kabulü 6 saat içinde bildirilmezse kabul edilmiş sayılır; ret halinde Merkez ikinci eksperi atar.',
      detail: 'İkinci atama da reddedilirse, sonraki eksperin (5684 m.22/13 istisnaları hariç) iş kabulü zorunludur.',
      legalReference: 'Genelge 2026/7 - İş kabulü',
      usageAreas: ['sure-takip-yardimcisi', 'atama-yardimcisi'],
      caution: 'Ret zinciri kuralı; performans puanlamasını da etkiler.',
      confidence: 'yuksek'
    },
    {
      id: `${SOURCE_ID}-ekspertiz-il-sureleri`,
      sourceId: SOURCE_ID, sourceTitle: SOURCE_TITLE, sourceDate: SOURCE_DATE, effectiveDate: EFFECTIVE_DATE,
      topic: 'sure', tags: ['aynı il ekspertiz 1 iş günü', 'farklı il ekspertiz 2 iş günü'],
      title: 'Ekspertiz işlemi süreleri (aynı/farklı il)',
      rule: 'Eksper aynı ildeyse atamayı takip eden ilk iş günü, farklı ildeyse en geç 2 iş günü içinde ekspertizi yapar.',
      detail: 'Rapor düzenlenmeyecek dosyada da aynı süre içinde ön rapor ile durum bildirilir.',
      legalReference: 'Genelge 2026/7 - Ön rapor ve rapor',
      usageAreas: ['sure-takip-yardimcisi'],
      caution: 'Bu süre ekspertiz işleminin yapılmasına ait; rapor tamamlama süresi ayrıdır.',
      confidence: 'yuksek'
    },
    {
      id: `${SOURCE_ID}-rapor-sureleri`,
      sourceId: SOURCE_ID, sourceTitle: SOURCE_TITLE, sourceDate: SOURCE_DATE, effectiveDate: EFFECTIVE_DATE,
      topic: 'sure', tags: ['trafik raporu 3 iş günü', 'diğer motorlu araç raporu 5 iş günü'],
      title: 'Rapor tamamlama süreleri',
      rule: 'Dosya rapor düzenlenebilir hale geldiği tarihten itibaren trafikte 3 iş günü, diğer motorlu araç sigortalarında 5 iş günü içinde rapor tamamlanır.',
      detail: 'Bu süreler ilk atanan eksperin normal rapor tamamlama süreleridir.',
      legalReference: 'Genelge 2026/7 - Ön rapor ve rapor',
      usageAreas: ['sure-takip-yardimcisi'],
      caution: 'İtiraz/hakem süreleri Atama Yönetmeliği m.8\'de ayrıca düzenlenmiştir.',
      confidence: 'yuksek'
    },
    {
      id: `${SOURCE_ID}-on-rapor-15-gun`,
      sourceId: SOURCE_ID, sourceTitle: SOURCE_TITLE, sourceDate: SOURCE_DATE, effectiveDate: EFFECTIVE_DATE,
      topic: 'on-rapor', tags: ['ön rapor', 'araç serviste yok', '15 gün kuralı'],
      title: 'Ön rapor ve 15 gün kuralı',
      rule: 'Araç serviste yoksa eksper durumu ön rapor ile bildirir; ön rapor tarihinden itibaren 15 gün içinde araç servise bırakılmazsa rapor kapatılır.',
      detail: 'Araç servise bırakıldığında eksper ekspertiz işlemini yapar.',
      legalReference: 'Genelge 2026/7 - Ön rapor ve rapor',
      usageAreas: ['sure-takip-yardimcisi', 'evrak-kontrol-yardimcisi'],
      caution: '15 gün dolduğunda rapor kapatma adımı hatırlatılmalıdır.',
      confidence: 'yuksek'
    },
    {
      id: `${SOURCE_ID}-onarim-30-gun`,
      sourceId: SOURCE_ID, sourceTitle: SOURCE_TITLE, sourceDate: SOURCE_DATE, effectiveDate: EFFECTIVE_DATE,
      topic: 'on-rapor', tags: ['30 gün kuralı', 'onarım'],
      title: 'Onarım 30 gün kuralı',
      rule: 'Ekspertiz yapıldıktan sonra onarım için 30 gün içinde araç servise bırakılmazsa ilk tespitler üzerine gerekçe ile rapor tamamlanır.',
      detail: 'Hasar ihbarından önce onarım yapılmışsa araç görülür ve onarımın hasarla uygunluğu raporda yer alır.',
      legalReference: 'Genelge 2026/7 - Ön rapor ve rapor',
      usageAreas: ['sure-takip-yardimcisi'],
      caution: 'Gerekçeli kapatma; eksper tespit ve kanaati gerekir.',
      confidence: 'yuksek'
    },
    {
      id: `${SOURCE_ID}-atama-kriterleri`,
      sourceId: SOURCE_ID, sourceTitle: SOURCE_TITLE, sourceDate: SOURCE_DATE, effectiveDate: EFFECTIVE_DATE,
      topic: 'atama', tags: ['atama kriterleri', 'coğrafi', 'iş yükü'],
      title: 'Sıralı atama kriterleri ve iş yükü',
      rule: 'Sıralı atamalar coğrafi sınıflandırma (il içi öncelik), branş/alt uzmanlık ve performans kriterlerine göre yapılır.',
      detail: 'Son 1 ayda atanan dosyaların %60\'ından fazlası açıksa azami iş yüküne ulaşılmış sayılır; bulunacak azami açık dosya limiti 20\'nin altına inemez.',
      legalReference: 'Genelge 2026/7 - Atama kriterleri',
      usageAreas: ['atama-yardimcisi'],
      caution: 'İş yükü hesabı bilgilendirme amaçlıdır; atamayı Merkez yapar.',
      confidence: 'orta'
    },
    {
      id: `${SOURCE_ID}-performans-1000-puan`,
      sourceId: SOURCE_ID, sourceTitle: SOURCE_TITLE, sourceDate: SOURCE_DATE, effectiveDate: EFFECTIVE_DATE,
      topic: 'performans', tags: ['performans puanlama', '1000 puan', 'ilk 15 dosya'],
      title: 'Performans puanlama (bilgi amaçlı)',
      rule: 'Eksperler 1000 tam puan üzerinden aylık puanlanır; her ay başı kriterler dikkate alınmadan ilk 15 dosya atanır.',
      detail: 'Kademe ve ceza puanlarının ayrıntısı performans bilgi yapısında tutulur. Bu bilgi otomatik karar üretmez.',
      legalReference: 'Genelge 2026/7 - Performans puanlama',
      usageAreas: ['performans-puanlama-yardimcisi'],
      caution: 'Yalnız bilgilendirme; HasarBotu puan hesaplayıp karar vermez.',
      confidence: 'orta'
    },
    {
      id: `${SOURCE_ID}-dosya-statuleri`,
      sourceId: SOURCE_ID, sourceTitle: SOURCE_TITLE, sourceDate: SOURCE_DATE, effectiveDate: EFFECTIVE_DATE,
      topic: 'dosya-statu', tags: ['dosya statüleri'],
      title: 'Dosya statüleri',
      rule: 'Dosya statüleri İcra Komitesi tarafından (TSB ve Merkez görüşüyle) belirlenir ve Merkez sistemine girilir.',
      detail: 'Statülerin dosya tamamlama sürelerine etkisi İcra Komitesince belirlenir. Statü listesinin kendisi bu belgede verilmemiştir.',
      legalReference: 'Genelge 2026/7 - Dosya statüleri',
      usageAreas: ['sure-takip-yardimcisi'],
      caution: 'Statü listesi belirsiz; ileride netleşince güncellenmelidir.',
      confidence: 'dusuk'
    }
  ]
};
