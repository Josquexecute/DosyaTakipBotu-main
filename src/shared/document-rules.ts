export const TRAFFIC_REQUIREMENTS = [
  { key: 'm-ehliyet', label: 'M Ehliyet' },
  { key: 'm-ruhsat', label: 'M Ruhsat' },
  { key: 'm-police', label: 'M Poliçe' },
  { key: 's-police', label: 'S Poliçe' },
  { key: 's-ehliyet', label: 'S Ehliyet' },
  { key: 's-ruhsat', label: 'S Ruhsat' },
  { key: 'ktt-zabit-beyan', label: 'KTT / ZABIT / BEYAN' },
  { key: 'agir-hasar-kontrol', label: 'Ağır Hasar / SBM ekran görüntüsü' }
] as const;

export const KASKO_REQUIREMENTS = [
  { key: 'k-ehliyet', label: 'K Ehliyet' },
  { key: 'k-ruhsat', label: 'K Ruhsat' },
  { key: 'k-police', label: 'Kasko Poliçe / K Poliçe' },
  { key: 'ktt-zabit-beyan', label: 'KTT / ZABIT / BEYAN' },
  { key: 'agir-hasar-kontrol', label: 'Ağır Hasar / SBM ekran görüntüsü' }
] as const;

export const PORTAL_CHECKLIST_DEFAULTS = [
  { key: 'foy-indirildi', label: 'Föy indirildi' },
  { key: 'klasor-acildi', label: 'Klasör açıldı' },
  { key: 'portal-evrak-yukleme', label: 'Evrak portala yüklendi' },
  { key: 'portal-fotograf-yukleme', label: 'Fotoğraflar portala yüklendi' },
  { key: 'parca-listesi-istendi', label: 'Parça listesi istendi' },
  { key: 'parca-kodlari-istendi', label: 'Parça kodları istendi' },
  { key: 'parca-iscilik-girildi', label: 'Parça / işçilik girişi yapıldı' },
  { key: 'on-rapor-hazirlandi', label: 'Ön rapor hazırlandı' },
  { key: 'uzman-onayi-alindi', label: 'Uzman onayı alındı' },
  { key: 'onarim-tamamlandi', label: 'Onarım tamamlandı' },
  { key: 'dosya-kapanis-kontrolu', label: 'Kapanış kontrolü yapıldı' },
  { key: 'dosya-kapatildi', label: 'Dosya kapatıldı' }
] as const;
