import type { NextFunction, Response } from 'express';
import type { AuthenticatedRequest } from '../types';

/**
 * Wraps an async handler so rejected promises are forwarded to Express error
 * middleware instead of crashing the process.
 */
export function asyncHandler(
  fn: (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}