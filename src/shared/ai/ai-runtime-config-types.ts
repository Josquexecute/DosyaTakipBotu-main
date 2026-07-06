/**
 * v0.6.x — AI ÇALIŞMA MODU / sağlayıcı altyapı HAZIRLIĞI (yalnız tip + güvenli varsayılan).
 *
 * Bu görevde gerçek sağlayıcı bağlanmaz: orchestrator çalıştırma, prompt gönderme, network, API key YOK.
 * Yalnızca ileride (kullanıcı açık onayıyla) etkinleştirilecek modların iskeleti tanımlanır.
 * Harici sağlayıcı VARSAYILAN KAPALI.
 */
export type AiMode = 'off' | 'local_rules' | 'local_model' | 'external_provider';

export type AiProviderKind = 'none' | 'ollama' | 'lm_studio' | 'openai_compatible' | 'custom_http';

export interface AiPrivacyMode {
  maskPlate: boolean;
  maskTcVkn: boolean;
  maskPhone: boolean;
  maskEmail: boolean;
  maskIban: boolean;
  requirePreviewBeforeExternalSend: boolean;
}

export interface AiRuntimeConfig {
  mode: AiMode;
  providerKind: AiProviderKind;
  /** Harici sağlayıcı kullanımı açık mı (varsayılan KAPALI). */
  externalProviderEnabled: boolean;
  privacy: AiPrivacyMode;
}

/** Tüm maskeler açık + harici göndermeden önce önizleme zorunlu (en güvenli profil). */
export const DEFAULT_AI_PRIVACY_MODE: AiPrivacyMode = {
  maskPlate: true,
  maskTcVkn: true,
  maskPhone: true,
  maskEmail: true,
  maskIban: true,
  requirePreviewBeforeExternalSend: true
};

/**
 * Güvenli varsayılan: yerel kural motoru; harici sağlayıcı KAPALI; API key yok.
 * Online AI sağlayıcıları sonraki görevde, kullanıcı açık onayıyla etkinleştirilecektir.
 */
export const DEFAULT_AI_RUNTIME_CONFIG: AiRuntimeConfig = {
  mode: 'local_rules',
  providerKind: 'none',
  externalProviderEnabled: false,
  privacy: DEFAULT_AI_PRIVACY_MODE
};
