/**
 * v0.6.x — AI İşçilik v3.3: İşçilik araç bağlamı tipi (SAF; ağ/dosya/online sorgu YOK).
 * Tam şasi/motor no YALNIZ yerel kalır; eşleşmede mümkünse chassisPrefix/engineCode kullanılır.
 */
export interface LaborVehicleContext {
  vehicleModel?: string;
  modelYear?: number;
  /** Tam şasi no (yalnız yerel saklama; eşleşmede önek tercih edilir). */
  chassisNo?: string;
  chassisPrefix?: string;
  /** Tam motor no (yalnız yerel saklama; eşleşmede kod tercih edilir). */
  engineNo?: string;
  engineCode?: string;
  plate?: string;
}
