import type { TrackingFile } from '../../shared/types';

export function canAutoMergeDifferentFields(_base: TrackingFile, _disk: TrackingFile, _incoming: TrackingFile): boolean {
  // Bu iskelet şimdilik güvenli davranır: otomatik ezme yapmaz.
  // Alan bazlı merge ikinci sürümde audit path karşılaştırmasıyla genişletilecek.
  return false;
}
