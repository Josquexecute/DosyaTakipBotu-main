import type { UiState } from '../state';
import { escapeHtml } from '../validation';
import { APP_VERSION } from '../../../shared/constants';
import { icon } from '../icons';
import { renderAiQueuePanel } from './ai-queue-panel';
import { renderKnowledgePanel } from './knowledge-panel';
import { LABOR_CATEGORIES, type LaborCategory } from '../../../shared/labor-rules';
import { normalizeSearch } from '../../../shared/turkish';
import type { LaborLearningEntry } from '../../../shared/labor-learning-dictionary';

const LABOR_LEARNING_FILTERS = [
  { value: 'all', label: 'Tüm kayıtlar' },
  { value: 'active', label: 'Aktif kayıtlar' },
  { value: 'disabled', label: 'Devre dışı kayıtlar' },
  ...LABOR_CATEGORIES.map((category) => ({ value: `cat:${category}`, label: category })),
  { value: 'recent', label: 'Son eklenenler' },
  { value: 'top', label: 'En çok kullanılanlar' }
];

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

      ${renderAiQueuePanel(state)}

      ${renderKnowledgePanel(state)}

      ${renderLaborLearningCard(state)}

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

function renderLaborLearningCard(state: UiState): string {
  const entries = sortedLaborLearningEntries(filteredLaborLearningEntries(state), state.laborLearningFilter);
  const total = state.laborLearningEntries.length;
  const active = state.laborLearningEntries.filter((entry) => entry.active !== false).length;
  const disabled = total - active;
  const shown = entries.slice(0, 80);
  const rows = shown.length
    ? shown.map((entry) => renderLaborLearningRow(entry, state.laborLearningExpanded[laborLearningEntryKey(entry)] === true)).join('')
    : '<div class="labor-learning-empty">Bu filtrede öğrenme kaydı yok.</div>';
  return `<div class="info-card wide labor-learning-card">
    <div class="labor-learning-header">
      <div>
        <h3>${icon('ai')} AI İşçilik Öğrenme Sözlüğü</h3>
        <p class="settings-help">Kullanıcı onayı veya düzeltmesiyle öğrenilen işçilik kararlarını yönetin. Devre dışı kayıtlar AI kararlarında kullanılmaz.</p>
      </div>
      <div class="settings-header-actions">
        <button class="secondary compact" data-action="labor-learning-refresh">${icon('refresh')}<span>Yenile</span></button>
        <button class="secondary compact" data-action="labor-learning-import">${icon('upload')}<span>İçe Aktar</span></button>
        <button class="secondary compact" data-action="labor-learning-export">${icon('excel')}<span>Dışa Aktar</span></button>
      </div>
    </div>
    <div class="labor-learning-stats">
      <span><small>Toplam</small><b>${total}</b></span>
      <span><small>Aktif</small><b>${active}</b></span>
      <span><small>Devre dışı</small><b>${disabled}</b></span>
      <span><small>Gösterilen</small><b>${entries.length}</b></span>
    </div>
    <div class="labor-learning-toolbar">
      <label class="labor-learning-search">${icon('search')}<input id="labor-learning-search" value="${escapeHtml(state.laborLearningSearch)}" placeholder="Parça adı, kod, işçilik veya gerekçe ara" /></label>
      <label>Filtre
        <select data-labor-learning-filter="dictionary">
          ${LABOR_LEARNING_FILTERS.map((filter) => `<option value="${escapeHtml(filter.value)}" ${state.laborLearningFilter === filter.value ? 'selected' : ''}>${escapeHtml(filter.label)}</option>`).join('')}
        </select>
      </label>
    </div>
    ${state.laborLearningReport ? `<div class="app-alert info"><span>${escapeHtml(state.laborLearningReport)}</span></div>` : ''}
    <div class="labor-learning-list">${rows}</div>
    ${entries.length > shown.length ? `<small class="settings-help inline">Performans için ilk ${shown.length} kayıt gösteriliyor. Arama veya filtreyle listeyi daraltabilirsiniz.</small>` : ''}
  </div>`;
}

function laborLearningEntryKey(entry: LaborLearningEntry): string {
  return `${entry.normalizedName}::${entry.partCode ?? ''}`;
}

// v0.6.0 UI: Kompakt akordeon satır. Varsayılan kapalı; yalnız özet (parça adı, kod, işçilik türleri,
// durum ve Aç/Kapat) gösterilir. Detay (meta + düzenleme + işlemler) yalnız kullanıcı "Aç" derse görünür.
function renderLaborLearningRow(entry: LaborLearningEntry, expanded: boolean): string {
  const keyAttrs = `data-learning-name="${escapeHtml(entry.normalizedName)}" data-learning-code="${escapeHtml(entry.partCode ?? '')}"`;
  const toggleAttrs = `data-learning-key="${escapeHtml(laborLearningEntryKey(entry))}"`;
  const categorySummary = entry.categories.length ? escapeHtml(entry.categories.join(', ')) : 'İşçilik türü yok';
  const summary = `<div class="labor-learning-summary">
      <button class="labor-learning-toggle secondary compact" data-action="labor-learning-toggle" ${toggleAttrs} type="button" aria-expanded="${expanded ? 'true' : 'false'}" title="${expanded ? 'Kaydı kapat' : 'Kaydı aç'}">${icon(expanded ? 'close' : 'details')}<span>${expanded ? 'Kapat' : 'Aç'}</span></button>
      <div class="labor-learning-summary-main">
        <b>${escapeHtml(entry.alias)}</b>
        <small>${escapeHtml(entry.normalizedName)}${entry.partCode ? ` • Kod: ${escapeHtml(entry.partCode)}` : ''}</small>
        <small>İşçilik: ${categorySummary}</small>
      </div>
      <span class="status-chip ${entry.active === false ? 'warning' : 'ok'}">${entry.active === false ? 'Devre dışı' : 'Aktif'}</span>
    </div>`;
  if (!expanded) {
    return `<div class="labor-learning-row compact ${entry.active === false ? 'disabled' : ''}" ${keyAttrs}>${summary}</div>`;
  }
  const categories = LABOR_CATEGORIES.map((category) => `<label><input type="checkbox" data-learning-category="${escapeHtml(category)}" ${entry.categories.includes(category) ? 'checked' : ''}/> ${escapeHtml(category)}</label>`).join('');
  return `<div class="labor-learning-row ${entry.active === false ? 'disabled' : ''}" ${keyAttrs}>
    ${summary}
    <div class="labor-learning-detail">
      <div class="labor-learning-meta">
        <span><small>İşçilik</small><b>${escapeHtml(entry.categories.join(', '))}</b></span>
        <span><small>Kaynak</small><b>${escapeHtml(laborLearningSourceLabel(entry.source))}</b></span>
        <span><small>Kullanım</small><b>${entry.useCount ?? 0}</b></span>
        <span><small>Öğrenildi</small><b>${escapeHtml(formatLearningDate(entry.createdAt))}</b></span>
        <span><small>Son kullanım</small><b>${escapeHtml(formatLearningDate(entry.lastUsedAt))}</b></span>
        <span><small>Güncelleme</small><b>${escapeHtml(formatLearningDate(entry.updatedAt))}</b></span>
      </div>
      <div class="labor-learning-edit">
        <div class="labor-learning-categories">${categories}</div>
        <label class="switch"><input type="checkbox" data-learning-review ${entry.needsReview ? 'checked' : ''}/> Kontrol gerekli varsayılanı</label>
        <label class="switch"><input type="checkbox" data-learning-active ${entry.active !== false ? 'checked' : ''}/> Aktif</label>
        <label class="wide">Karar gerekçesi / not<textarea data-learning-reason rows="2">${escapeHtml(entry.reason ?? '')}</textarea></label>
      </div>
      <div class="labor-learning-actions">
        <button class="primary compact" data-action="labor-learning-update" ${keyAttrs}>${icon('check')}<span>Kaydet</span></button>
        ${entry.active === false
          ? `<button class="secondary compact" data-action="labor-learning-enable" ${keyAttrs}>Aktifleştir</button>`
          : `<button class="secondary compact" data-action="labor-learning-disable" ${keyAttrs}>Devre dışı bırak</button>`}
        <button class="secondary danger compact" data-action="labor-learning-delete" ${keyAttrs}>Sil</button>
      </div>
    </div>
  </div>`;
}

function filteredLaborLearningEntries(state: UiState): LaborLearningEntry[] {
  const query = normalizeSearch(state.laborLearningSearch);
  const filter = state.laborLearningFilter || 'all';
  return state.laborLearningEntries.filter((entry) => {
    if (filter === 'active' && entry.active === false) return false;
    if (filter === 'disabled' && entry.active !== false) return false;
    if (filter.startsWith('cat:') && !entry.categories.includes(filter.slice(4) as LaborCategory)) return false;
    if (!query) return true;
    const haystack = normalizeSearch([
      entry.alias,
      entry.normalizedName,
      entry.partCode ?? '',
      entry.categories.join(' '),
      entry.reason ?? ''
    ].join(' '));
    return haystack.includes(query);
  });
}

function sortedLaborLearningEntries(entries: LaborLearningEntry[], filter: string): LaborLearningEntry[] {
  const copy = [...entries];
  if (filter === 'top') return copy.sort((a, b) => (b.useCount ?? 0) - (a.useCount ?? 0));
  return copy.sort((a, b) => (Date.parse(b.updatedAt || '') || 0) - (Date.parse(a.updatedAt || '') || 0));
}

function laborLearningSourceLabel(source?: string): string {
  if (source === 'user-correction') return 'Kullanıcı düzeltmesi';
  if (source === 'user-approval') return 'Kullanıcı onayı';
  return 'Manuel kayıt';
}

function formatLearningDate(value?: string): string {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString('tr-TR') : '-';
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
