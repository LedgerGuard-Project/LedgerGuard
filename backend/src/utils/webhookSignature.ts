import { createHmac, timingSafeEqual } from 'crypto';

export const WEBHOOK_SIGNATURE_HEADER = 'x-ledgerguard-signature';
const SIGNATURE_TOLERANCE_SECONDS = 300;

/**
 * Produce the signed webhook header value:
 *   t=<unix-seconds>,v1=<hex hmac-sha256 of "<timestamp>.<body>">
 */
export function signWebhookPayload(secret: string, body: string, timestamp?: number): string {
  const ts = timestamp ?? Math.floor(Date.now() / 1000);
  const hmac = createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex');
  return `t=${ts},v1=${hmac}`;
}

/**
 * Verify a signed webhook header. Returns false for malformed headers,
 * stale timestamps, or signature mismatches (timing-safe comparison).
 */
export function verifyWebhookSignature(
  secret: string,
  body: string,
  header: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  const parts = header.split(',').map((p) => p.trim().split('='));
  let ts: number | undefined;
  let sig: string | undefined;
  for (const [name, value] of parts) {
    if (name === 't') ts = Number(value);
    if (name === 'v1') sig = value;
  }
  if (ts === undefined || !sig || !Number.isFinite(ts)) return false;
  if (Math.abs(nowSeconds - ts) > SIGNATURE_TOLERANCE_SECONDS) return false;
  const expected = createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex');
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(sig, 'hex');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}