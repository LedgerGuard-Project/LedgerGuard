import rateLimit from 'express-rate-limit';
import { config } from '../config';
import { redisService } from '../services/redis/RedisService';

/**
 * Dedicated, stricter rate limiter for authentication endpoints (login,
 * register, refresh, logout). Protects against brute-force and credential
 * stuffing without being tied to the global API limiter.
 */
export const authRateLimiter = rateLimit({
  windowMs: config.authRateLimitWindowMs,
  max: config.authRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: { code: 'RATE_LIMITED', message: 'Too many attempts. Please try again later.' },
  },
});

/**
 * Progressive-delay / soft account lockout using Redis (degrades gracefully
 * when Redis is unavailable — never blocks legitimate logins).
 *
 * NOTE: The same generic "Invalid credentials" error is ALWAYS returned to the
 * client regardless of lockout state, so account existence is never leaked.
 */
const LOCKOUT_KEY_PREFIX = 'lg:lockout:';

interface LockoutEntry {
  failures: number;
  lockedUntil: number; // epoch ms (0 = not locked)
}

function lockoutKey(tenantId: string, email: string): string {
  return `${LOCKOUT_KEY_PREFIX}${tenantId}:${email.toLowerCase()}`;
}

export async function recordFailedLogin(tenantId: string, email: string): Promise<boolean> {
  const key = lockoutKey(tenantId, email);
  if (!redisService.isAvailable) return false;
  try {
    const raw = await redisService.get(key);
    let entry: LockoutEntry | null = null;
    if (raw) {
      try { entry = JSON.parse(raw); } catch { entry = null; }
    }
    const now = Date.now();
    if (entry && entry.lockedUntil > now) return false; // already locked

    const failures = (entry?.failures ?? 0) + 1;
    const locked = failures >= config.lockoutMaxAttempts;
    const lockEntry: LockoutEntry = {
      failures,
      lockedUntil: locked ? now + config.lockoutDurationMs : 0,
    };
    const ttl = locked
      ? Math.ceil((lockEntry.lockedUntil - now) / 1000) + 5
      : config.lockoutWindowMs;
    await redisService.set(key, JSON.stringify(lockEntry), ttl);
    return locked;
  } catch {
    return false;
  }
}

export async function isAccountLocked(tenantId: string, email: string): Promise<boolean> {
  const key = lockoutKey(tenantId, email);
  if (!redisService.isAvailable) return false;
  try {
    const raw = await redisService.get(key);
    if (!raw) return false;
    const entry = JSON.parse(raw) as LockoutEntry;
    if (entry.lockedUntil > Date.now()) return true;
    await redisService.delete(key);
    return false;
  } catch {
    return false;
  }
}

export async function clearFailedLogins(tenantId: string, email: string): Promise<void> {
  if (!redisService.isAvailable) return;
  try {
    await redisService.delete(lockoutKey(tenantId, email));
  } catch {
    // degraded — ignore
  }
}

