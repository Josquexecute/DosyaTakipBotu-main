const icons: Record<string, string> = {
  add: '+',
  ai: '◇',
  backup: '⇩',
  board: '▦',
  calendar: '□',
  check: '✓',
  close: '×',
  dashboard: '▦',
  details: '▤',
  document: '▧',
  down: '⌄',
  excel: '▥',
  export: '⇩',
  filter: '▽',
  folder: '▣',
  health: '●',
  help: '?',
  info: 'i',
  issue: '!',
  ktt: '§',
  labor: '₺',
  note: '✎',
  operation: '⚙',
  open: '↗',
  pc: '▢',
  photo: '▨',
  portal: '◎',
  refresh: '↻',
  risk: '◆',
  rucu: '↔',
  search: '⌕',
  settings: '⚙',
  sync: '↻',
  theme: '◐',
  upload: '⇧',
  warning: '!'
};

export function icon(name: string, label?: string): string {
  const symbol = icons[name] ?? '•';
  const title = label ? ` title="${escapeAttribute(label)}"` : '';
  return `<span class="ui-icon" aria-hidden="true"${title}>${symbol}</span>`;
}

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
