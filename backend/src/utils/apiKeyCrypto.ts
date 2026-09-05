import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { API_KEY_PREFIX } from '@ledgerguard/shared';

/** Length of the random key body (32 bytes -> 64 hex chars). */
const KEY_BODY_BYTES = 32;

/**
 * Generate a cryptographically random API key. The raw key is returned to the
 * caller exactly once; only the SHA-256 hash should ever be persisted.
 */
export function generateApiKey(): { rawKey: string; keyHash: string; displayPrefix: string } {
  const body = randomBytes(KEY_BODY_BYTES).toString('hex');
  const rawKey = `${API_KEY_PREFIX}${body}`;
  return { rawKey, keyHash: hashApiKey(rawKey), displayPrefix: `${API_KEY_PREFIX}${body.slice(0, 4)}…` };
}

/** SHA-256 hex digest of a raw API key (storage form). */
export function hashApiKey(rawKey: string): string {
  return createHash('sha256').update(rawKey, 'utf8').digest('hex');
}

/** Constant-time comparison of a raw key against a stored hash. */
export function verifyApiKey(rawKey: string, keyHash: string): boolean {
  const candidate = Buffer.from(hashApiKey(rawKey), 'hex');
  const stored = Buffer.from(keyHash, 'hex');
  if (candidate.length !== stored.length) return false;
  return timingSafeEqual(candidate, stored);
}

/** Does a bearer token look like an API key rather than a JWT? */
export function looksLikeApiKey(token: string): boolean {
  return token.startsWith(API_KEY_PREFIX);
}