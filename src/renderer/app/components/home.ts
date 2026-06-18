import type { UiState } from '../state';
import { escapeHtml } from '../validation';
import { icon } from '../icons';

interface CategoryCard {
  tab: string;
  iconName: string;
  title: string;
  description: string;
  badge?: number;
  tone: 'info' | 'warning' | 'critical';
}

/**
 * v0.4.1 Ana Sayfa: yalnızca kompakt kategori paneli.
 * Bilerek "Önce Bakılacak Dosyalar" odak listesi, "Bugün X konu dikkat istiyor" uyarı bloğu,
 * büyük yoğun tablolar ve KPI yığını RENDER EDİLMEZ. Kullanıcı buradan ilgili bölüme geçer.
 */
export function renderHome(state: UiState): string {
  const d = state.dashboard;
  const totalCases = d?.totalCases ?? state.cases.length;
  const monthCount = new Set(state.cases.map((item) => item.monthFolder).filter(Boolean)).size;
  const criticalIssues = state.cases.filter((item) => item.trackingIssue?.severity === 'critical' || (item.caseIssues ?? []).some((issue) => issue.severity === 'critical')).length;
  const riskCount = criticalIssues + (d?.conflicts ?? 0);
  const docPhoto = (d?.missingDocuments ?? 0) + (d?.missingPhotos ?? 0) + (d?.unsupportedPhotos ?? 0);
  const portalPending = d?.portalPending ?? 0;

  const cards: CategoryCard[] = [
    { tab: 'dosyalar', iconName: 'folder', title: 'Dosyalar', description: 'Tüm taranan dosyaların tam listesi', badge: totalCases, tone: 'info' },
    { tab: 'durum', iconName: 'board', title: 'Durum Panosu', description: 'Tüm dosyaların son durumu (sayfalı, 50/sayfa)', badge: totalCases, tone: 'info' },
    { tab: 'klasorler', iconName: 'details', title: 'Klasörler', description: 'Aktif kök klasör yapısı (yalnızca-okunur)', badge: monthCount, tone: 'info' },
    { tab: 'operasyon', iconName: 'operation', title: 'Operasyon', description: 'Sorumlu, durum, görev ve notlar', badge: d?.openTasks ?? 0, tone: 'info' },
    { tab: 'evrak', iconName: 'photo', title: 'Evrak & Fotoğraf', description: 'Eksik evrak ve fotoğraf kontrolü', badge: docPhoto, tone: docPhoto ? 'warning' : 'info' },
    { tab: 'issues', iconName: 'issue', title: 'Sorunlar / Risk', description: 'Takip ve veri riskleri / uyarılar', badge: riskCount, tone: riskCount ? 'critical' : 'info' },
    { tab: 'portal', iconName: 'portal', title: 'Portal', description: 'Portal kontrol listesi', badge: portalPending, tone: portalPending ? 'warning' : 'info' },
    { tab: 'labor', iconName: 'excel', title: 'Excel Araçları', description: 'İşçilik Excel dağıtımı', tone: 'info' },
    { tab: 'rucu', iconName: 'rucu', title: 'Rücu', description: 'Rücu potansiyeli takibi', badge: d?.rucuPotential ?? 0, tone: 'info' },
    { tab: 'ktt', iconName: 'ktt', title: 'KTT / Kusur', description: 'Kusur yardımcı modülü', tone: 'info' },
    { tab: 'heavy', iconName: 'warning', title: 'Ağır Hasar', description: 'Ağır hasar yardımcı modülü', badge: d?.heavyDamageEnabled ?? 0, tone: 'info' },
    { tab: 'settings', iconName: 'settings', title: 'Ayarlar', description: 'Ana klasör, kullanıcı ve sürüm kontrolü', tone: 'info' }
  ];

  return `<section class="home-page">
    <div class="home-heading">
      <div>
        <h2>Ana Sayfa</h2>
        <p>Baran Global Ekspertiz — kategori paneli. Çalışmak istediğiniz bölümü seçin.</p>
      </div>
      <div class="home-summary-chip">${icon('folder')}<span>${escapeHtml(String(totalCases))} dosya • ${escapeHtml(String(monthCount))} ay klasörü</span></div>
    </div>
    <div class="category-grid">
      ${cards.map(renderCategoryCard).join('')}
    </div>
  </section>`;
}

function renderCategoryCard(card: CategoryCard): string {
  const badge = typeof card.badge === 'number'
    ? `<span class="category-badge ${card.tone}">${escapeHtml(String(card.badge))}</span>`
    : '';
  return `<button class="category-card" data-tab="${escapeHtml(card.tab)}" title="${escapeHtml(card.title)}">
    <span class="category-icon">${icon(card.iconName)}</span>
    ${badge}
    <b class="category-title">${escapeHtml(card.title)}</b>
    <span class="category-desc">${escapeHtml(card.description)}</span>
  </button>`;
}
