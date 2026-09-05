/** Standard envelope returned by all LedgerGuard API endpoints. */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ApiError;
  meta?: Record<string, unknown>;
}

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
  /** Correlation ID for tracing an error back to its request (Phase 4, Part 12/14). */
  requestId?: string;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

export type PaginationQuery = {
  page?: number;
  perPage?: number;
};