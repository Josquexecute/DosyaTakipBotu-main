import path from 'node:path';
import { normalizeSearch } from '../../shared/turkish';

export function isPcloudConflictFile(fileName: string): boolean {
  const n = normalizeSearch(fileName);
  // Hotfix 5: sıradan Windows "- Kopya" dosyaları kırmızı pCloud alarmı üretmesin.
  // Gerçek alarm için conflict/çakış/pCloud bağlamı aranır.
  return n.includes('CONFLICT') || n.includes('CONFLICTED') || n.includes('PCLOUD') || n.includes('CAKIS') || n.includes('CAKISMA') || n.includes('ÇAKIS') || n.includes('ÇAKISMA');
}

export function isTrackingConflictCandidate(fileName: string): boolean {
  const ext = path.extname(fileName).toLowerCase();
  const n = normalizeSearch(fileName);
  return ext === '.json' && /TAKIP|TRACKING/.test(n) && isPcloudConflictFile(fileName);
}

export function listConflictNames(filePaths: string[]): string[] {
  return filePaths.map((filePath) => path.basename(filePath)).filter(isPcloudConflictFile);
}
