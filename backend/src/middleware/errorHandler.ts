import type { NextFunction, Request, Response } from 'express';
import type { ApiResponse } from '@ledgerguard/shared';
import { ApiError } from '../utils/ApiError';
import { config } from '../config';
import { logger } from '../utils/logger';

/** Central error handler. Always returns the standard ApiResponse envelope. */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  let statusCode = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'Internal server error';
  let details: unknown;

  if (err instanceof ApiError) {
    statusCode = err.statusCode;
    code = err.code;
    message = err.message;
    details = err.details;
  } else if (err && typeof err === 'object' && 'name' in err && (err as any).name === 'MongoServerError') {
    const mongoErr = err as any;
    if (mongoErr.code === 11000) {
      statusCode = 409;
      code = 'DUPLICATE_KEY';
      message = 'A record with those unique fields already exists';
      details = mongoErr.keyValue;
    }
  } else if (err instanceof Error) {
    // Honor duck-typed errors (e.g. validation middleware) that carry a status code.
    const maybe = err as Error & { statusCode?: number; code?: string };
    if (typeof maybe.statusCode === 'number') {
      statusCode = maybe.statusCode;
      code = maybe.code ?? 'ERROR';
      details = (maybe as { details?: unknown }).details;
    }
    message = err.message;
  }

  if (statusCode >= 500) {
    logger.error(message, { err, req: { method: req.method, url: req.originalUrl, ip: req.ip } });
  }

  const payload: ApiResponse<never> = {
    success: false,
    error: { code, message, ...(details !== undefined ? { details } : {}) },
  };

  if (config.env === 'development' && statusCode >= 500 && err instanceof Error) {
    payload.error!.details = payload.error!.details ?? { stack: err.stack };
  }

  res.status(statusCode).json(payload);
}