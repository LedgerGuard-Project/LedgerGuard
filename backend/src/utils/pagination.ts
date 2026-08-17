import type { Pagination } from '../types';

/** Parse and clamp pagination query parameters. */
export function parsePagination(query: Record<string, unknown>): Pagination {
  const page = Math.max(1, parseInt(String(query.page ?? '1'), 10) || 1);
  const rawPerPage = parseInt(String(query.perPage ?? '20'), 10);
  const perPage = Math.min(100, Math.max(1, rawPerPage || 20));
  return { page, perPage, skip: (page - 1) * perPage };
}