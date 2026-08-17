/**
 * Lightweight input sanitisation helper. Real validation is handled with Zod
 * schemas; these helpers only strip control characters & trim strings.
 */
export function sanitizeString(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim();
}

export function sanitizeObject<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    out[key] = typeof value === 'string' ? sanitizeString(value) : value;
  }
  return out as T;
}