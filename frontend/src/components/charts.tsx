import type { ReactNode } from 'react';
import type { SeriesPoint } from '../types/analytics';
import { formatNumber } from '../utils/format';
import { Spinner } from './Spinner';

// ---------------------------------------------------------------------------
// Shared chart primitives (pure SVG — no heavy dependencies).
// ---------------------------------------------------------------------------

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

function niceMax(values: number[]): number {
  const raw = Math.max(...values, 0);
  if (raw === 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  return (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
}

function compactMoney(v: number): string {
  const n = v / 100;
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(0)}k`;
  return `${n.toFixed(0)}`;
}

function EmptyChart({ label = 'No chart data yet' }: { label?: string }) {
  return <div className="flex h-[180px] items-center justify-center text-sm text-ink-400">{label}</div>;
}

export function LineChart({
  series,
  height = 220,
  money = false,
}: {
  series: SeriesPoint[];
  height?: number;
  money?: boolean;
}) {
  const width = 1000;
  const pad = { top: 12, right: 14, bottom: 26, left: 52 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  if (series.length === 0) return <EmptyChart />;
  const max = niceMax(series.map((p) => p.value));
  const x = (i: number) => pad.left + innerW * (series.length === 1 ? 0.5 : i / (series.length - 1));
  const y = (v: number) => pad.top + innerH - (v / max) * innerH;
  const path = series.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const step = max / 4;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="line chart">
      {[0, 1, 2, 3, 4].map((i) => {
        const gy = pad.top + innerH * (i / 4);
        return (
          <g key={i}>
            <line x1={pad.left} y1={gy} x2={width - pad.right} y2={gy} stroke="currentColor" className="text-ink-200 dark:text-ink-800" strokeWidth={1} />
            <text x={pad.left - 6} y={gy + 3} textAnchor="end" fontSize={9} className="fill-ink-400">
              {money ? compactMoney(max - step * i) : formatNumber(max - step * i)}
            </text>
          </g>
        );
      })}
      <polyline points={path} fill="none" stroke="#6366f1" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
      {series.map((p, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(p.value)} r={2.5} fill="#6366f1" />
          {(i === 0 || i === series.length - 1) && (
            <text x={x(i)} y={height - 8} textAnchor={i === 0 ? 'start' : 'end'} fontSize={9} className="fill-ink-500">
              {p.label}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}
export function BarChart({
  series,
  height = 220,
  money = false,
}: {
  series: SeriesPoint[];
  height?: number;
  money?: boolean;
}) {
  const width = 1000;
  const pad = { top: 8, right: 14, bottom: 26, left: 48 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  if (series.length === 0) return <EmptyChart />;
  const max = niceMax(series.map((p) => p.value));
  const bw = innerW / series.length;
  const barW = Math.min(40, bw * 0.6);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="bar chart">
      {[0, 1, 2, 3, 4].map((i) => {
        const gy = pad.top + innerH * (i / 4);
        const val = max - (max / 4) * i;
        return (
          <g key={i}>
            <line x1={pad.left} y1={gy} x2={width - pad.right} y2={gy} stroke="currentColor" className="text-ink-200 dark:text-ink-800" strokeWidth={1} />
            <text x={pad.left - 6} y={gy + 3} textAnchor="end" fontSize={9} className="fill-ink-400">
              {money ? compactMoney(val) : formatNumber(val)}
            </text>
          </g>
        );
      })}
      {series.map((p, i) => {
        const h = max > 0 ? (p.value / max) * innerH : 0;
        const cx = pad.left + i * bw + bw / 2;
        return (
          <g key={p.key}>
            <rect x={cx - barW / 2} y={pad.top + innerH - h} width={barW} height={h} rx={4} fill={COLORS[i % COLORS.length]} opacity={0.9} />
            {p.label && (
              <text x={cx} y={height - 8} textAnchor="middle" fontSize={8} className="fill-ink-500">
                {p.label.length > 12 ? `${p.label.slice(0, 11)}...` : p.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

export function DonutChart({
  segments,
  centerLabel,
  centerValue,
  size = 160,
}: {
  segments: Array<{ label: string; value: number }>;
  centerLabel?: string;
  centerValue?: string;
  size?: number;
}) {
  const total = segments.reduce((a, s) => a + s.value, 0);
  if (total <= 0) return <EmptyChart label="No data" />;
  const r = size / 2 - 8;
  const c = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className="flex items-center gap-4">
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} className="shrink-0" role="img" aria-label="donut chart">
        {segments.map((s, i) => {
          const dash = (s.value / total) * c;
          const el = (
            <circle
              key={s.label}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={COLORS[i % COLORS.length]}
              strokeWidth={26}
              strokeDasharray={`${dash} ${c - dash}`}
              strokeDashoffset={-offset}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          );
          offset += dash;
          return el;
        })}
        <text x="50%" y="47%" textAnchor="middle" fontSize={size / 7} fontWeight={700} className="fill-ink-900 dark:fill-white">
          {centerValue ?? ''}
        </text>
        {centerLabel && (
          <text x="50%" y="56%" textAnchor="middle" fontSize={size / 11} className="fill-ink-500">
            {centerLabel}
          </text>
        )}
      </svg>
      <div className="min-w-0 space-y-1">
        {segments.map((s, i) => (
          <div key={s.label} className="flex items-center gap-2 text-xs">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: COLORS[i % COLORS.length] }} />
            <span className="truncate text-ink-600 dark:text-ink-300">{s.label}</span>
            <span className="ml-auto font-medium text-ink-900 dark:text-white">
              {total > 0 ? `${((s.value / total) * 100).toFixed(1)}%` : '0%'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
export function ChartCard({
  title,
  subtitle,
  children,
  loading,
  className,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  loading?: boolean;
  className?: string;
}) {
  return (
    <div className={`card p-4${className ? ` ${className}` : ''}`}>
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-ink-900 dark:text-white">{title}</h3>
        {subtitle && <p className="text-xs text-ink-500">{subtitle}</p>}
      </div>
      {loading ? (
        <div className="flex h-[200px] items-center justify-center">
          <Spinner />
        </div>
      ) : (
        children
      )}
    </div>
  );
}

export function KpiCard({
  title,
  value,
  sub,
  accent = 'text-ink-900 dark:text-white',
}: {
  title: string;
  value: ReactNode;
  sub?: ReactNode;
  accent?: string;
}) {
  return (
    <div className="card p-4">
      <p className="stat-label">{title}</p>
      <p className={`mt-1 text-2xl font-bold ${accent}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-ink-500">{sub}</p>}
    </div>
  );
}

export function PageScaffold({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink-900 dark:text-white">{title}</h1>
          {subtitle && <p className="mt-0.5 text-sm text-ink-500">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

export function DeltaBadge({ pct, direction }: { pct: number; direction: 'up' | 'down' | 'flat' }) {
  const cls =
    direction === 'up'
      ? 'text-green-600'
      : direction === 'down'
        ? 'text-red-600'
        : 'text-ink-500';
  const arrow = direction === 'up' ? '↑' : direction === 'down' ? '↓' : '→';
  return (
    <span className={`text-xs font-medium ${cls}`}>
      {arrow} {Math.abs(pct).toFixed(1)}%
    </span>
  );
}