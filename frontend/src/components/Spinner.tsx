import type { FC } from 'react';
import { cn } from '../lib/utils';

export const Spinner: FC<{ className?: string }> = ({ className }) => (
  <svg
    className={`animate-spin ${cn('text-brand-600', className)}`}
    width="20"
    height="20"
    viewBox="0 0 20 20"
    fill="currentColor"
    aria-label="loading"
  >
    <circle
      className="opacity-25"
      cx="10"
      cy="10"
      r="8"
      stroke="currentColor"
      strokeWidth="2"
    />
    <path
      className="opacity-75"
      fill="currentColor"
      d="M10 1v3m0 12v3m7.66-9.66H17m-7 7V17m5.66-11.66 2.12-2.12M5.22 5.22l2.12 2.12M4.34 11.66H2.34m11.32 5.66-2.12 2.12"
    />
  </svg>
);