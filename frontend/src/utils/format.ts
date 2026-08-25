export function formatCurrency(value: number, currency = 'USD'): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 2 }).format(
      Number(value),
    );
  } catch {
    return `$${Number(value).toFixed(2)}`;
  }
}

/** Format an integer minor-unit amount (e.g. cents) as a currency string. */
export function formatMinor(minor: number, currency = 'USD'): string {
  const major = Number(minor) / 100;
  return formatCurrency(major, currency);
}

export function formatNumber(value: number): string {
  try {
    return new Intl.NumberFormat('en-US').format(Number(value));
  } catch {
    return String(value);
  }
}

export function formatDate(value: string | Date): string {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return String(value);
  }
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}