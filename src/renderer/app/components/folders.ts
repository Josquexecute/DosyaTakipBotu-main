import type { UiState } from '../state';
import type { FolderBrowseResult, FolderNode, FolderTrackingStatus } from '../../../shared/types';
import { escapeHtml, formatDate } from '../validation';
import { icon } from '../icons';

/**
 * v0.4.1 Klasörler: pCloud klasör ağacının YALNIZCA-OKUNUR görünümü.
 * Tüm veriler güvenli main-process IPC (folder:list) üzerinden gelir; renderer dosya
 * sistemine doğrudan erişmez. Bu ekran hiçbir klasör/dosya oluşturmaz, silmez, değiştirmez.
 */
export function renderFolders(state: UiState): string {
  const browse = state.folderBrowse;
  const rootConfirmed = state.settings?.rootPathConfirmed === true;

  const header = `<div class="folders-heading">
    <div>
      <h2>Klasörler</h2>
      <p>Aktif kök klasör yapısı — yalnızca görüntüleme. Bu ekran hiçbir klasör/dosya oluşturmaz, silmez veya değiştirmez.</p>
    </div>
    <button class="secondary compact" data-action="folder-refresh" title="Klasörleri yeniden oku">${icon('refresh')}<span>Yenile</span></button>
  </div>`;

  if (!rootConfirmed) {
    return `<section class="folders-page">${header}
      <div class="empty-state panel-empty">${icon('folder')}<h3>Ana klasör seçilmedi</h3><p>Klasör gezgini için önce Ayarlar ekranından aktif (tercihen yerel) ana klasörü seçin.</p>
        <div class="empty-actions"><button class="secondary compact" data-tab="settings">${icon('settings')}<span>Ayarlar</span></button></div>
      </div>
    </section>`;
  }

  if (state.folderLoading && !browse) {
    return `<section class="folders-page">${header}<div class="empty-state panel-empty">${icon('sync')}<h3>Klasörler okunuyor…</h3><p>Aktif kök klasör listesi alınıyor.</p></div></section>`;
  }

  if (!browse) {
    return `<section class="folders-page">${header}<div class="empty-state panel-empty">${icon('folder')}<h3>Klasör görünümü hazır</h3><p>Aktif kök klasörlerini görüntülemek için Yenile düğmesine basın.</p></div></section>`;
  }

  const body = !browse.rootAvailable
    ? `<div class="app-alert warning">${icon('warning')}<span>Aktif ana klasör şu anda erişilebilir değil: ${escapeHtml(browse.rootPath)}</span></div>`
    : browse.targetIsCase
      ? renderCaseView(browse)
      : renderNodeList(browse);

  return `<section class="folders-page">
    ${header}
    <div class="folder-toolbar">
      ${browse.parentPath ? `<button class="secondary compact" data-folder-nav="${escapeHtml(browse.parentPath)}" title="Üst klasör">${icon('open')}<span>Üst Klasör</span></button>` : ''}
      ${renderCrumbs(browse)}
    </div>
    <div class="folder-tree">
      ${body}
    </div>
  </section>`;
}

function renderCrumbs(browse: FolderBrowseResult): string {
  const segments = relativeSegments(browse.rootPath, browse.currentPath);
  const root = `<span class="folder-crumb root">${icon('folder')}${escapeHtml(browse.rootPath || 'Kök')}</span>`;
  const rest = segments.map((segment) => `<span class="folder-crumb">${escapeHtml(segment)}</span>`).join('');
  return `<div class="folder-crumbs">${root}${rest}</div>`;
}

function relativeSegments(rootPath: string, currentPath: string): string[] {
  const normalize = (value: string) => value.replace(/[\\/]+/g, '/').replace(/\/+$/, '');
  const root = normalize(rootPath);
  const current = normalize(currentPath);
  if (current.toLowerCase().startsWith(root.toLowerCase())) {
    return current.slice(root.length).split('/').filter(Boolean);
  }
  return current.split('/').filter(Boolean).slice(-2);
}

function renderNodeList(browse: FolderBrowseResult): string {
  if (browse.nodes.length === 0) {
    return `<div class="empty-state small">${icon('folder')}<h3>Bu klasörde alt klasör yok</h3><p>Görüntülenecek ay/dosya klasörü bulunamadı.</p></div>`;
  }
  return `<div class="folder-node-list">${browse.nodes.map(renderFolderNodeRow).join('')}</div>`;
}

function renderFolderNodeRow(node: FolderNode): string {
  const kindLabel = node.kind === 'month' ? 'Ay klasörü' : node.kind === 'case' ? 'Dosya klasörü' : 'Klasör';
  const select = node.selectable
    ? `<button class="secondary compact folder-select" data-folder="${escapeHtml(node.path)}" title="Bu dosyayı seç">${icon('check')}<span>Seç</span></button>`
    : '';
  return `<div class="folder-node ${node.kind}">
    <button class="folder-node-main" data-folder-nav="${escapeHtml(node.path)}" title="${escapeHtml(node.name)}">
      <span class="folder-node-icon">${icon(node.kind === 'case' ? 'folder' : 'details')}</span>
      <span class="folder-node-text"><b>${escapeHtml(node.plate || node.name)}</b><small>${escapeHtml(node.plate ? node.name : kindLabel)}</small></span>
      <span class="folder-node-go">${icon('open')}</span>
    </button>
    ${select}
  </div>`;
}

function renderCaseView(browse: FolderBrowseResult): string {
  const name = browse.currentPath.replace(/[\\/]+$/, '').split(/[\\/]/).pop() ?? browse.currentPath;
  return `<div class="folder-case-view">
    <div class="folder-case-head">
      <div><h3>${escapeHtml(name)}</h3><p>Dosya klasörü içeriği — yalnızca görüntüleme</p></div>
      <button class="secondary compact" data-folder="${escapeHtml(browse.currentPath)}" title="Bu dosyayı seç">${icon('check')}<span>Bu Dosyayı Seç</span></button>
    </div>
    <div class="folder-group-grid">
      ${browse.nodes.map((group) => `<div class="folder-group ${group.exists ? 'ok' : 'missing'}">
        <span class="folder-group-icon">${icon(group.exists ? 'check' : 'warning')}</span>
        <b>${escapeHtml(group.groupKey || group.name)}</b>
        <small>${group.exists ? escapeHtml(group.name) : 'Klasör yok'}</small>
      </div>`).join('')}
    </div>
    ${renderTrackingStatus(browse.tracking)}
  </div>`;
}

function renderTrackingStatus(tracking?: FolderTrackingStatus): string {
  if (!tracking || !tracking.exists) {
    return `<div class="folder-tracking missing">${icon('info')}<div><b>_HASARBOTU / takip.json</b><p>Bu dosyada takip.json bulunamadı. Pasif görüntüleme dosya oluşturmaz.</p></div></div>`;
  }
  if (tracking.issue === 'corrupt') {
    return `<div class="folder-tracking warning">${icon('warning')}<div><b>_HASARBOTU / takip.json</b><p>takip.json okunamadı veya bozuk görünüyor. Sorunlar / Risk ekranından inceleyin.</p></div></div>`;
  }
  const parts = [
    typeof tracking.revision === 'number' ? `Revizyon ${tracking.revision}` : '',
    tracking.updatedAt ? `Güncelleme ${formatDate(tracking.updatedAt)}` : '',
    tracking.updatedByComputer || ''
  ].filter(Boolean).join(' • ');
  return `<div class="folder-tracking ok">${icon('check')}<div><b>_HASARBOTU / takip.json</b><p>${escapeHtml(parts || 'Mevcut')}</p></div></div>`;
}
