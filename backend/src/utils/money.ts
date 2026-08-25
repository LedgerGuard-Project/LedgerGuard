/**
 * Money helpers. All financial values are stored as integer minor units
 * (e.g. cents for USD) to avoid floating-point drift in ledger math.
 */

export const MINOR_UNIT_PRECISION = 2;
export const MINOR_UNIT_MULTIPLIER = 10 ** MINOR_UNIT_PRECISION;

/** Round to an exact 2-decimal "money" number (major units). */
export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Convert a validated major-unit amount into integer minor units. */
export function toMinor(value: number): number {
  return Math.round(roundMoney(value) * MINOR_UNIT_MULTIPLIER);
}

/** Convert integer minor units into a major-unit decimal number. */
export function fromMinor(minor: number): number {
  return Math.round(minor) / MINOR_UNIT_MULTIPLIER;
}

/**
 * Validate that a user-supplied amount is a positive number with at most two
 * decimal places. Returns the integer minor-unit equivalent.
 * Throws with a human-readable reason otherwise.
 */
export function amountToMinor(value: unknown): number {
  const raw = typeof value === 'string' ? value.trim() : value;
  const num = typeof raw === 'number' ? raw : Number(raw);
  if (typeof raw !== 'number' && typeof raw !== 'string') {
    throw new Error('amount must be a number');
  }
  if (!Number.isFinite(num)) {
    throw new Error('amount must be a finite number');
  }
  if (num <= 0) {
    throw new Error('amount must be greater than zero');
  }
  const decimals = decimalPlaces(num);
  if (decimals > MINOR_UNIT_PRECISION) {
    throw new Error(`amount may have at most ${MINOR_UNIT_PRECISION} decimal places`);
  }
  return toMinor(num);
}

function decimalPlaces(value: number): number {
  const text = String(value);
  const dot = text.indexOf('.');
  if (dot === -1) return 0;
  const fraction = text.slice(dot + 1);
  // Strip trailing zeros before counting (e.g. 1.2300 -> 2).
  const trimmed = fraction.replace(/0+$/, '');
  return trimmed.length;
}

/** Sum a list of minor-unit integers safely. */
export function sumMinor(values: number[]): number {
  return values.reduce((acc, v) => acc + Math.round(v), 0);
}
