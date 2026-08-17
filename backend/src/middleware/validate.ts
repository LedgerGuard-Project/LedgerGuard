import type { NextFunction, Request, Response } from 'express';
import type { ZodTypeAny, ZodError } from 'zod';
import { ApiError } from '../utils/ApiError';

/**
 * Validate a request part (body, query, params) against a Zod schema.
 * On failure responds 400 with a readable list of issues.
 */
export function validate(schema: ZodTypeAny, part: 'body' | 'query' | 'params' = 'body') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[part]);
    if (!result.success) {
      const issues = flattenIssues(result.error);
      return next(ApiError.badRequest(`Validation failed: ${issues.join('; ')}`, 'VALIDATION_ERROR', issues));
    }
    req[part] = result.data as never;
    next();
  };
}

function flattenIssues(error: ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length ? issue.path.join('.') : '(root)';
    return `${path}: ${issue.message}`;
  });
}