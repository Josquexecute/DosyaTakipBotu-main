/**
 * Saha / İş Notları referansı — "İŞ NOTLAR.docx" içeriğinden yapısallaştırılmıştır.
 * Eksperin sahada parça/işçilik kararı verirken hatırlaması gereken iç operasyon notları.
 * NOT: Bu bedeller ve uygulama notları iç referanstır; dosya, servis, sigorta şirketi
 * uygulaması ve poliçe koşullarına göre nihai kontrol yapılmalıdır.
 */
export interface IsNotuMaddesi {
  konu: string;
  not: string;
  dikkat: string;
}

export interface IsNotuBolumu {
  baslik: string;
  maddeler: IsNotuMaddesi[];
}

export const IS_NOTLARI: readonly IsNotuBolumu[] = [
  {
    baslik: '1. Mobil Onarım ve Ek İşçilik',
    maddeler: [
      { konu: 'Jant mobil onarım', not: 'Mobilci jant düzeltme + jant boyamayı birlikte yapar. Referans bedel: 2.500 ₺.', dikkat: 'Hasarlı jant fotoğrafı, öncesi/sonrası görsel ve gerekirse rot-balans kalemi kontrol edilir.' },
      { konu: 'Ön tampon mobil onarım', not: 'Mobilci plastik kaynak/tamir yapar; sök-tak / mobil onarım referans bedeli: 2.500 ₺.', dikkat: 'Tampon boyası servis/usta tarafından yapılır; boya kalemi ayrıca değerlendirilir.' },
      { konu: 'Klima gazı', not: 'Klima radyatörü söküldüğünde klima gazı eklenir. Referans bedel: 2.500 ₺.', dikkat: 'Klima radyatörü değişimi/sökümü varsa ek masraf olarak kontrol edilir.' },
      { konu: 'Antifriz', not: 'Motor radyatörü söküldüğünde antifriz eklenir. Referans bedel: 1.500 ₺.', dikkat: 'Motor radyatörü değişimi/sökümü varsa dosyada ayrıca değerlendirilir.' },
      { konu: 'Rot-balans / kalibrasyon', not: 'Jant hasarlarında rot-balans/kalibrasyon referans bedeli teker sayısından bağımsız 2.000 ₺.', dikkat: 'Birden fazla teker etkilenmişse işçilik dağıtımında toplam bedel teker sayısına bölünebilir.' }
    ]
  },
  {
    baslik: '2. Ön Takım, Direksiyon ve Aktarma',
    maddeler: [
      { konu: 'Sol tabla / beşik', not: 'Servis dilinde "sol tabla" çoğunlukla sol salıncak/ön takım; "beşik" ise travers grubu için kullanılır.', dikkat: 'Parça adı servis listesi, katalog ve fotoğrafla teyit edilir; tabla ile motor beşiği karıştırılmaz.' },
      { konu: 'Motor beşiği / ön travers', not: 'Motor-şanzıman/ön takım bağlantılarını taşıyan ana taşıyıcı parçalardan biridir.', dikkat: 'Motor kulağı (takoz), travers ve bağlantı noktaları ayrı ayrı kontrol edilir.' },
      { konu: 'Motor kulakları (takoz)', not: 'Motor titreşimini azaltır; motor/şanzıman grubunun şasiye bağlantısını sağlar.', dikkat: 'Sadece darbe yönü ve hasar belirtisi varsa yazılır.' },
      { konu: 'Direksiyon ve ön takım', not: 'Rot mili, rot başı, Z rot, direksiyon kutusu denge ve süspansiyon davranışında etkilidir.', dikkat: 'Direksiyon kutusu ile rot/Z rot kalemleri ayrı hasar mantığıyla değerlendirilir.' },
      { konu: 'Aktarma hattı', not: 'Motor gücü şanzımana, oradan aks ile teker poryasına aktarılır.', dikkat: 'Aks, porya, taşıyıcı ve şanzıman bağlantıları darbe yönüne göre kontrol edilir.' },
      { konu: 'Fren sistemi', not: 'Ana fren parçaları fren diski ve fren balatasıdır.', dikkat: 'Disk, balata, kaliper ve hortum hasarı ayrı ayrı fotoğraflanır.' }
    ]
  },
  {
    baslik: '3. Ön Bölüm / Soğutma / Panel',
    maddeler: [
      { konu: 'Ön soğutma dizilimi', not: 'Önde klima radyatörü; turbo araçlarda intercooler; arkasında motor radyatörü ve fan.', dikkat: 'Intercooler olup olmadığı marka-model ve motor tipine göre teyit edilir.' },
      { konu: 'Ön panel işçiliği', not: 'Klima radyatörü, intercooler, motor radyatörü ve fan sök-tak çoğu dosyada ön panel/ön grup işçiliğine girer.', dikkat: 'Ayrı işçilik yazılacaksa gerekçe ve hasar ilişkisi açık olmalıdır.' },
      { konu: 'Ön tampon arkası', not: 'Arkada tampon köpüğü (darbe emici), ön tampon demiri, ön panel ve sağ/sol şase uçları bulunabilir.', dikkat: 'Tampon dış hasarı varsa arkadaki gizli parçalar fotoğrafla kontrol edilir.' }
    ]
  },
  {
    baslik: '4. Arka Bölüm / Bagaj Havuzu',
    maddeler: [
      { konu: 'Arka tampon arkası', not: 'Arkada (her araçta olmayabilen) tampon köpüğü, arka tampon demiri, arka panel ve bagaj havuzu bulunabilir.', dikkat: 'Tampon söküldüğünde iç parçaların fotoğrafları mutlaka alınır.' },
      { konu: 'Bagaj havuzu hasarı', not: 'Havuz hasarlıysa darbenin arka tampon grubu ve arka panel hattından içeri ilerlediği düşünülür.', dikkat: '"Önündeki tüm parçalar kesin hasarlı" kabul edilmez; tampon, demir, arka panel ve bağlantılar kontrol edilir.' }
    ]
  },
  {
    baslik: '5. Süreç ve Dosya Kuralları',
    maddeler: [
      { konu: 'Araştırma / pert süreci', not: 'Araştırma ve pert süreçleri dosya içeriğine göre 60 güne kadar sürebilir.', dikkat: 'Sigorta şirketi, servis, sovtaj ve araştırma süreci ayrıca takip edilir.' },
      { konu: 'Kasko dosyaları', not: 'Eşdeğer parça uygulaması şirket/poliçe kuralına göre değerlendirilir.', dikkat: 'Eşdeğer parça yazılmadan önce şirket kuralı ve poliçe şartı kontrol edilir.' }
    ]
  },
  {
    baslik: '6. Fotoğraf ve Parça Listesi Kontrolü',
    maddeler: [
      { konu: 'Fotoğraf zorunluluğu', not: 'Parça listesine yazılan her parçanın hasarlı fotoğrafı dosyada bulunmalıdır.', dikkat: 'Parça adı; servis listesi, hasarlı parça fotoğrafı ve araç yapısıyla uyumlu olmalıdır.' },
      { konu: 'Darbe yönü ilişkisi', not: 'Ek kalemler (mobil onarım, boya, sök-tak, klima gazı, antifriz, rot-balans) dosya içeriğiyle ilişkilendirilir.', dikkat: 'Darbe yönüyle ilgisi olmayan parça/işçilik kalemi yazılmaz; tereddütte servis/usta beyanı + katalog + görsel birlikte değerlendirilir.' }
    ]
  }
];
