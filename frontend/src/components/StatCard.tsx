import type { FC, ReactNode } from 'react';
import { cn } from '../lib/utils';
import { motion } from 'framer-motion';

interface StatCardProps {
  title: string;
  value: ReactNode;
  icon?: ReactNode;
  trend?: 'up' | 'down' | 'neutral';
  sub?: string;
  className?: string;
}

export const StatCard: FC<StatCardProps> = ({ title, value, icon, trend, sub, className }) => {
  const trendColor = {
    up: 'text-green-600',
    down: 'text-red-600',
    neutral: 'text-ink-500',
  }[trend ?? 'neutral'];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'card p-5 transition-shadow hover:shadow-card-lg',
        className,
      )}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="stat-label">{title}</p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-ink-900 dark:text-white">{value}</span>
            {sub && <span className="text-xs text-ink-500 dark:text-ink-400">{sub}</span>}
          </div>
          {trend && <span className={cn('mt-1 text-xs font-medium', trendColor)}></span>}
        </div>
        {icon && <div className="shrink-0 text-brand-600">{icon}</div>}
      </div>
    </motion.div>
  );
};