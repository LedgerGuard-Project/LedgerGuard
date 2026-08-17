/**
 * Operational error carrying an HTTP status and a stable machine-readable code.
 */
export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(message: string, statusCode = 500, code = 'INTERNAL_ERROR', details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message = 'Bad request', code = 'BAD_REQUEST', details?: unknown): ApiError {
    return new ApiError(message, 400, code, details);
  }

  static unauthorized(message = 'Unauthorized', code = 'UNAUTHORIZED'): ApiError {
    return new ApiError(message, 401, code);
  }

  static forbidden(message = 'Forbidden', code = 'FORBIDDEN'): ApiError {
    return new ApiError(message, 403, code);
  }

  static notFound(message = 'Not found', code = 'NOT_FOUND'): ApiError {
    return new ApiError(message, 404, code);
  }

  static conflict(message = 'Conflict', code = 'CONFLICT'): ApiError {
    return new ApiError(message, 409, code);
  }
}