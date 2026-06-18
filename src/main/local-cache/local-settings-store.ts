/**
 * Geriye dönük uyumluluk / denetim çıpası modülü.
 * Uygulama ayarları (app-settings.json) ayrı bir `LocalSettingsStore` sınıfında DEĞİL;
 * yerel önbellek ve ayarlar `LocalCacheStore` içinde birlikte yönetilir. Bu dosya yalnızca
 * eski import yollarını ve dağıtım denetimini (final-office-audit) bozmamak için
 * `LocalCacheStore`'u yeniden dışa aktarır — burada ayrı bir ayar mantığı yoktur.
 */
export { LocalCacheStore } from './local-cache-store';
