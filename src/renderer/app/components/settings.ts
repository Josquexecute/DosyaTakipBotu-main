import type { UiState } from '../state';
import { escapeHtml } from '../validation';
import { APP_VERSION } from '../../../shared/constants';
import { icon } from '../icons';

export function renderSettingsPage(state: UiState): string {
  const settings = state.settings;
  if (!settings) {
    return `<section class="settings-page"><div class="empty-state panel-empty">${icon('warning')}<h2>Ayarlar yüklenemedi</h2><p>Yerel ayar dosyası okunamadı.</p></div></section>`;
  }

  const users = settings.users?.length ? settings.users : [settings.activeUser || 'Sistem'];
  return `<section class="settings-page">
    <div class="section-heading settings-heading">
      <div>
        <h2>Ayarlar / Canlı Kullanım</h2>
        <p>Kullanıcı, ana klasör, tema, görünüm ve ofis dağıtım kontrolleri bu bilgisayardaki güvenli yerel önbelleğe kaydedilir.</p>
      </div>
      <div class="settings-header-actions">
        <button class="secondary" data-action="choose-root">${icon('folder')}<span>Ana Klasör Seç</span></button>
        <button class="primary" data-action="save-settings">${icon('check')}<span>Ayarları Kaydet</span></button>
      </div>
    </div>

    <div class="settings-grid">
      <div class="info-card wide settings-path-card">
        <h3>${icon('folder')} Sistem Yolları</h3>
        <div class="form-grid compact-form">
          <label class="wide">Ana klasör yolu
            <div class="path-picker-row">
              <input id="settings-root-path" value="${escapeHtml(settings.rootPath)}" placeholder="P:\\BARAN GLOBAL EKSPERTİZ\\2026" />
              <button class="secondary" data-action="choose-root" type="button">Seç</button>
            </div>
            <small class="settings-help inline">İlk kurulumda 2026 ana klasörünü siz seçin. Ay klasörü seçilirse program o ayın dosyalarını da okuyabilir.</small>
          </label>
          <label>Aktif kullanıcı
            <select data-setting="activeUser">
              ${users.map((name) => `<option value="${escapeHtml(name)}" ${name === settings.activeUser ? 'selected' : ''}>${escapeHtml(name)}</option>`).join('')}
            </select>
          </label>
          <label>Tema
            <select data-setting="theme">
              <option value="light" ${settings.theme !== 'dark' ? 'selected' : ''}>Açık tema</option>
              <option value="dark" ${settings.theme === 'dark' ? 'selected' : ''}>Koyu tema</option>
            </select>
          </label>
          <label>Yakınlaştırma
            <select data-setting="zoom">
              ${[0.85, 0.9, 1, 1.1, 1.2, 1.3].map((zoom) => `<option value="${zoom}" ${Math.abs((settings.zoom ?? 1) - zoom) < 0.01 ? 'selected' : ''}>%${Math.round(zoom * 100)}</option>`).join('')}
            </select>
          </label>
          <label>Bilgisayar
            <input value="${escapeHtml(settings.activeComputer)}" readonly />
          </label>
        </div>
      </div>

      ${renderVersionControlCard(state)}

      <div class="info-card wide">
        <h3>${icon('ai')} AI / Parça Okuma (Gemini)</h3>
        <p class="settings-help">El yazısı parça listesi fotoğraflarını okuyup usta dilini gerçek parça adına çevirmek için Google Gemini (ücretsiz katman) kullanılır. Anahtar yalnızca bu bilgisayarın yerel ayarında saklanır; pCloud'a/repoya gitmez.</p>
        <div class="form-grid compact-form">
          <label class="wide">Gemini API Anahtarı
            <input data-setting="geminiApiKey" type="password" autocomplete="off" spellcheck="false" placeholder="${settings.geminiApiKey ? '•••••• (kayıtlı)' : 'AI Studio anahtarınızı yapıştırın'}" value="${escapeHtml(settings.geminiApiKey ?? '')}" />
            <small class="settings-help inline">aistudio.google.com → Get API key (kart istemez, ücretsiz). Gizlilik: seçtiğiniz fotoğraf analiz için Google'a gönderilir; parça listelerinde kişisel veri tutmamaya özen gösterin.</small>
          </label>
        </div>
      </div>

      <div class="info-card wide">
        <h3>${icon('operation')} Kullanıcı Yönetimi</h3>
        <p class="settings-help">Buradaki liste raportör/sorumlu seçimlerinde kullanılır. Kullanıcı silmek eski takip kayıtlarını silmez; sadece yeni seçim listesinden kaldırır.</p>
        <div class="user-management-list">
          ${users.map((name, index) => renderUserRow(name, index, name === settings.activeUser, users.length <= 1)).join('')}
        </div>
        <div class="inline-add settings-add-user">
          <input id="new-user-name" placeholder="Yeni kullanıcı adı soyadı" />
          <button class="primary" data-action="add-user">${icon('add')}<span>Kullanıcı Ekle</span></button>
        </div>
      </div>

      <div class="info-card wide">
        <h3>${icon('sync')} Otomatik Tarama</h3>
        <p class="settings-help">Uygulama açık kaldığı sürece bu aralıkla güvenli yeniden tarama yapılır. Minimum 5 dakikadır.</p>
        <div class="form-grid compact-form">
          <label>Otomatik yeniden tarama / ms<input data-setting-interval="fullYearLightMs" type="number" min="300000" max="3600000" value="${escapeHtml(settings.scanIntervals.fullYearLightMs)}" /></label>
        </div>
      </div>
    </div>
  </section>`;
}

function renderVersionControlCard(state: UiState): string {
  const deployment = state.deploymentStatus;
  const clients = deployment?.clients ?? [];
  const warningList = deployment?.warnings?.length
    ? `<ul class="version-warning-list">${deployment.warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join('')}</ul>`
    : '<p class="settings-help">Bu bilgisayarda bloklayıcı sürüm uyarısı yok.</p>';
  return `<div class="info-card wide version-control-card">
    <h3>${icon('health')} Sürüm ve Kurulum Kontrolü</h3>
    <p class="settings-help">Ofisteki tüm bilgisayarların aynı EXE sürümünde kalması için kullanılır. Canlı klasörde hedef sürüm kaydı varsa eski kalan bilgisayarda uyarı görünür.</p>
    <div class="version-grid">
      <div><span>Bu bilgisayar</span><b>${escapeHtml(deployment?.activeComputer ?? state.settings?.activeComputer ?? '-')}</b></div>
      <div><span>Kurulu sürüm</span><b>v${escapeHtml(deployment?.appVersion ?? APP_VERSION)}</b></div>
      <div><span>Ofis hedef sürümü</span><b>${deployment?.expectedVersion ? `v${escapeHtml(deployment.expectedVersion)}` : 'Henüz yok'}</b></div>
      <div><span>Son kontrol</span><b>${escapeHtml(deployment?.checkedAt ? new Date(deployment.checkedAt).toLocaleString('tr-TR') : '-')}</b></div>
    </div>
    ${warningList}
    <div class="settings-header-actions version-actions">
      <button class="secondary" data-action="refresh-deployment-status" type="button">${icon('refresh')}<span>Sürüm Kontrolünü Yenile</span></button>
      <button class="primary" data-action="register-deployment-client" type="button" ${deployment?.canWriteClientStatus === false ? 'disabled' : ''}>${icon('pc')}<span>Bu PC'yi Ofis Listesine Kaydet</span></button>
    </div>
    <div class="version-client-list">
      <h4>Kayıtlı Bilgisayarlar</h4>
      ${clients.length === 0 ? '<p class="settings-help">Henüz kayıtlı bilgisayar yok. Her PC’de bu panelden veya PowerShell komutuyla kayıt alınmalıdır.</p>' : `<table><thead><tr><th>Bilgisayar</th><th>Sürüm</th><th>Kullanıcı</th><th>Kayıt Zamanı</th></tr></thead><tbody>${clients.map((client) => `<tr><td>${escapeHtml(client.computer)}</td><td>v${escapeHtml(client.appVersion)}</td><td>${escapeHtml(client.user)}</td><td>${escapeHtml(client.recordedAt ? new Date(client.recordedAt).toLocaleString('tr-TR') : '-')}</td></tr>`).join('')}</tbody></table>`}
    </div>
    <p class="settings-help inline">Aktif kök yerel klasör olmalıdır (pCloud yalnızca manuel yedek/arşiv). PowerShell standardı: <code>npm run live:version-check -- -RootPath "D:\\BARAN_GLOBAL_EKSPERTIZ\\2026" -ExpectedVersion ${escapeHtml(APP_VERSION)} -SetExpected -RegisterThisPC</code></p>
  </div>`;
}

function renderUserRow(name: string, index: number, active: boolean, onlyUser: boolean): string {
  return `<div class="user-row ${active ? 'active' : ''}">
    <div class="avatar small">${escapeHtml(initials(name))}</div>
    <input data-user-rename="${index}" value="${escapeHtml(name)}" aria-label="Kullanıcı adı" />
    <button class="secondary" data-action="set-active-user" data-user-index="${index}" ${active ? 'disabled' : ''}>${active ? 'Aktif' : 'Aktif Yap'}</button>
    <button class="secondary danger" data-action="remove-user" data-user-index="${index}" ${onlyUser ? 'disabled' : ''}>Sil</button>
  </div>`;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return `${parts[0]?.[0] ?? 'K'}${parts.at(-1)?.[0] ?? ''}`.toLocaleUpperCase('tr-TR').slice(0, 2);
}
