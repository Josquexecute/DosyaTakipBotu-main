import { safeFileDisplayName } from './turkish';

export type TrackingItemPrefix = 'todo' | 'note';

export function sanitizeClientTrackingItemId(value: unknown, prefix: TrackingItemPrefix): string | undefined {
  if (typeof value !== 'string') return undefined;
  const cleaned = safeFileDisplayName(value.trim());
  return new RegExp(`^${prefix}-[A-Za-z0-9-]{8,80}$`).test(cleaned) ? cleaned : undefined;
}

export function chooseTrackingItemId(
  requestedId: unknown,
  prefix: TrackingItemPrefix,
  existingIds: Iterable<string>,
  fallback: () => string
): string {
  const sanitized = sanitizeClientTrackingItemId(requestedId, prefix);
  if (sanitized && !new Set(existingIds).has(sanitized)) return sanitized;
  return fallback();
}
