import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';

declare global {
  namespace Express {
    interface Request {
      /** Correlation ID set by the requestId middleware. */
      id?: string;
    }
  }
}

/**
 * Attach a correlation ID to every request so frontend errors → API → DB can be
 * traced end-to-end. The ID is set on `req.id` and surfaced to the client via
 * the `X-Request-Id` response header, then included in all server logs.
 */
const REQUEST_ID_HEADER = 'x-request-id';

export function requestId(): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    const header = req.headers[REQUEST_ID_HEADER];
    const id = (Array.isArray(header) ? header[0] : header) || randomUUID();
    req.id = id;
    res.setHeader(REQUEST_ID_HEADER, id);
    next();
  };
}

export { REQUEST_ID_HEADER };