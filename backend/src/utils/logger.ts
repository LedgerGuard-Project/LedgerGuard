import { config } from '../config';

const LEVELS: Record<string, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const current = LEVELS[config.logLevel] ?? LEVELS.info;

function emit(level: string, msg: string, meta?: unknown): void {
  if ((LEVELS[level] ?? 0) < current) return;
  const line = `${new Date().toISOString()} [${level.toUpperCase()}] ${msg}`;
  if (meta !== undefined) {
    // eslint-disable-next-line no-console
    console[level === 'debug' ? 'log' : level === 'warn' ? 'warn' : level === 'error' ? 'error' : 'log'](
      line,
      typeof meta === 'string' ? meta : JSON.stringify(meta),
    );
  } else {
    // eslint-disable-next-line no-console
    console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'](line);
  }
}

export const logger = {
  debug: (msg: string, meta?: unknown) => emit('debug', msg, meta),
  info: (msg: string, meta?: unknown) => emit('info', msg, meta),
  warn: (msg: string, meta?: unknown) => emit('warn', msg, meta),
  error: (msg: string, meta?: unknown) => emit('error', msg, meta),
};