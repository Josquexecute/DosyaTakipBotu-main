export function normalizePathForCompare(input: string): string {
  return foldWindowsPathForCompare(input).replace(/[\\/]+/g, '/').replace(/\/+$/, '');
}

function foldWindowsPathForCompare(input: string): string {
  return String(input || '')
    .normalize('NFC')
    .replace(/[İIıi]/g, 'I')
    .replace(/[Şş]/g, 'S')
    .replace(/[Ğğ]/g, 'G')
    .replace(/[Üü]/g, 'U')
    .replace(/[Öö]/g, 'O')
    .replace(/[Çç]/g, 'C')
    .toUpperCase();
}

export function isPathInsideNormalized(childPath: string, parentPath: string): boolean {
  const child = normalizePathForCompare(childPath);
  const parent = normalizePathForCompare(parentPath);
  return child === parent || child.startsWith(parent + '/');
}
