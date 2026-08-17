import type { FC } from 'react';

export const Logo: FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    width="32"
    height="32"
    viewBox="0 0 32 32"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden
  >
    <rect x="4" y="4" width="24" height="24" rx="6" fill="url(#brand)" />
    <path
      d="M16 10A6 6 0 0 1 22 16H18V22H14V16H10A6 6 0 0 1 16 10Z"
      fill="url(#white)"
    />
    <defs>
      <linearGradient id="brand" x1="0" y1="0" x2="1" y2="1">
        <stop stopColor="#4f46e5" />
        <stop offset="1" stopColor="#6366f1" />
      </linearGradient>
      <linearGradient id="white" x1="0" y1="0" x2="0" y2="1">
        <stop stopColor="#ffffff" />
        <stop offset="1" stopColor="#f8fafc" />
      </linearGradient>
    </defs>
  </svg>
);

export const LogoSymbol: FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    width="32"
    height="32"
    viewBox="0 0 32 32"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden
  >
    <path
      d="M8 8h16v16H8z"
      fill="url(#brand)"
    />
    <path
      d="M12 12h8v8h-8z"
      fill="url(#white)"
    />
    <defs>
      <linearGradient id="brand" x1="0" y1="0" x2="1" y2="1">
        <stop stopColor="#4f46e5" />
        <stop offset="1" stopColor="#6366f1" />
      </linearGradient>
      <linearGradient id="white" x1="0" y1="0" x2="0" y2="1">
        <stop stopColor="#ffffff" />
        <stop offset="1" stopColor="#f8fafc" />
      </linearGradient>
    </defs>
  </svg>
);