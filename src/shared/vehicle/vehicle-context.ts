/**
 * v0.6.2: Merkezi Araç Bağlamı (Vehicle Context).
 *
 * Bu yapı HER hasar dosyasına ÖZELdir ve yalnızca o dosyanın _HASARBOTU/takip.json içinde saklanır.
 * Global/local genel araç havuzu YOKTUR; bir dosyanın bilgisi başka dosyaya otomatik taşınmaz.
 * Tüm alanlar OPSİYONELdir (geriye uyumluluk: eski dosyalar boş bağlamla açılır).
 *
 * Gizlilik: Şase No / Motor No hassastır; harici AI çağrısına GÖNDERİLMEZ (vehicleContextForAi onları çıkarır)
 * ve gereksiz loglanmaz. Yerel kural değerlendirmesi (vehicle-fit-evaluator) bu alanları kullanabilir.
 */
export interface VehicleContext {
  plate?: string;
  /** Şase No (hassas — harici AI'ya gönderilmez, loglanmaz). */
  chassisNo?: string;
  /** Motor No (hassas — harici AI'ya gönderilmez, loglanmaz). */
  engineNo?: string;
  make?: string;
  model?: string;
  modelYear?: string;
  /** benzin | dizel | hibrit | elektrik | lpg | '' */
  fuelType?: string;
  engineDisplacement?: string;
  /** manuel | otomatik | yarı-otomatik | '' */
  transmission?: string;
  /** sedan | hatchback | suv | ticari | '' (kasa/araç tipi) */
  bodyType?: string;
  /** ön | arka | sağ | sol | ön-sağ ... (darbe bölgesi / hasar yönü) */
  damageDirection?: string;
}

/** Kullanıcıdan/depodan düzenlenebilir araç bağlamı alanları (UI + güvenli güncelleme whitelist'i ile ortak). */
export const VEHICLE_CONTEXT_FIELDS = [
  'plate', 'chassisNo', 'engineNo', 'make', 'model', 'modelYear',
  'fuelType', 'engineDisplacement', 'transmission', 'bodyType', 'damageDirection'
] as const;

export type VehicleContextField = typeof VEHICLE_CONTEXT_FIELDS[number];

const MAX_FIELD_LEN = 80;

function cleanField(value: unknown): string {
  return typeof value === 'string'
    ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_FIELD_LEN)
    : '';
}

/** Ham/eksik bağlamı güvenli, normalize bir VehicleContext'e çevirir (tüm alanlar string, kırpılmış). */
export function normalizeVehicleContext(value: unknown): VehicleContext {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const out: VehicleContext = {};
  for (const field of VEHICLE_CONTEXT_FIELDS) out[field] = cleanField(source[field]);
  return out;
}

/** En az bir anlamlı (boş olmayan) araç bilgisi var mı? */
export function hasMeaningfulVehicleContext(context: VehicleContext | undefined | null): boolean {
  if (!context) return false;
  return VEHICLE_CONTEXT_FIELDS.some((field) => (context[field] ?? '').trim().length > 0);
}

/**
 * Harici AI çağrısına/loglara verilebilecek GÜVENLİ alt küme. Şase No ve Motor No KESİNLİKLE çıkarılır;
 * yalnızca normalize araç bilgisi (marka/model/yıl/yakıt/hacim/vites/kasa/yön) döner.
 */
export function vehicleContextForAi(context: VehicleContext | undefined | null): Omit<VehicleContext, 'chassisNo' | 'engineNo'> {
  const normalized = normalizeVehicleContext(context ?? {});
  const { chassisNo: _chassis, engineNo: _engine, ...safe } = normalized;
  return safe;
}

/** Kullanıcıya gösterilecek kısa Türkçe özet (Şase/Motor No GÖSTERİLMEZ — özet amaçlı). */
export function vehicleContextSummary(context: VehicleContext | undefined | null): string {
  const c = normalizeVehicleContext(context ?? {});
  const parts = [c.make, c.model, c.modelYear, c.fuelType].map((v) => (v ?? '').trim()).filter(Boolean);
  return parts.length ? parts.join(' • ') : 'Araç bilgisi girilmedi';
}

/** Model yılını sayıya çevirir (geçersizse null). */
export function vehicleModelYear(context: VehicleContext | undefined | null): number | null {
  const raw = (context?.modelYear ?? '').replace(/[^\d]/g, '').slice(0, 4);
  const year = Number.parseInt(raw, 10);
  return Number.isFinite(year) && year >= 1950 && year <= 2100 ? year : null;
}

/** Yakıt tipini normalize sınıfa çevirir (benzin/dizel/hibrit/elektrik/lpg/unknown). */
export function vehicleFuelClass(context: VehicleContext | undefined | null): 'benzin' | 'dizel' | 'hibrit' | 'elektrik' | 'lpg' | 'unknown' {
  const f = (context?.fuelType ?? '').toLocaleLowerCase('tr-TR');
  if (/diz?el|mazot/.test(f)) return 'dizel';
  if (/hibrit|hybrid/.test(f)) return 'hibrit';
  if (/elektrik|electric|ev\b/.test(f)) return 'elektrik';
  if (/lpg|otogaz/.test(f)) return 'lpg';
  if (/benzin|petrol|gasoline/.test(f)) return 'benzin';
  return 'unknown';
}
