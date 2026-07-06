/**
 * v0.6.0 — Performans / puanlama BİLGİ yapısı (SEDDK Genelge 2026/7).
 *
 * SADECE BİLGİ AMAÇLIDIR. HasarBotu bu veriyle otomatik karar/puan hesaplayıp atama yapmaz.
 * SAF modül: ağ/dosya/AI yok; yalnızca sabit referans veri ve bilgi amaçlı saf bir yardımcı.
 */

export const PERFORMANS_DISCLAIMER =
  'Performans/puanlama bilgisi yalnız bilgilendirme amaçlıdır; HasarBotu otomatik puan hesaplayıp karar vermez. Resmî puanlama Merkez tarafından yapılır.';

export const PERFORMANS_TAM_PUAN = 1000;
export const PERFORMANS_ILK_DOSYA_KRITER_DISI = 15;

/** Hasar kademesine göre atama puanı (bilgi amaçlı). */
export const HASAR_KADEME_PUANI: ReadonlyArray<{ kademeler: readonly number[]; puan: number; agirTamDahil?: boolean }> = [
  { kademeler: [1, 2], puan: 1 },
  { kademeler: [3, 4], puan: 2 },
  { kademeler: [5, 6], puan: 3, agirTamDahil: true }
];

/** Performans ceza puanları (bilgi amaçlı). */
export const PERFORMANS_CEZA_PUANLARI: Readonly<Record<string, number>> = {
  'atama-reddi': 2,
  'suresinde-tamamlanmayan-rapor': 2,
  'arac-gorulme-suresi': 1,
  'disiplin-uyarma': 10,
  'disiplin-kinama': 20,
  'disiplin-gecici-alikoyma': 30,
  'hasar-bedeli-mutabakati': 3,
  'egitim': 5,
  'is-yuku': 1,
  'usul-esaslara-uyum': 2,
  'dosya-maliyet-uygunlugu': 5
};

/**
 * Bilgi amaçlı: bir hasar kademesinin (1-6) atama puanını döndürür.
 * Ağır/tam hasar, hasar tutarına bakılmaksızın 3 puandır.
 * Karar üretmez; yalnız referans değeri verir.
 */
export function hasarKademePuani(kademe: number, agirVeyaTamHasar = false): number {
  if (agirVeyaTamHasar) return 3;
  const match = HASAR_KADEME_PUANI.find((row) => row.kademeler.includes(kademe));
  return match ? match.puan : 0;
}
