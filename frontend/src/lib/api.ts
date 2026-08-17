import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '../store/authStore';
import type { ApiResponse, AuthSession } from '../types';

/**
 * Resolve the API base URL so every request hits the real backend prefix.
 * Both env vars are normalized to `origin + /api`:
 *  - VITE_API_URL       http://localhost:4000      -> http://localhost:4000/api
 *                       http://localhost:4000/api  -> http://localhost:4000/api
 *  - VITE_API_BASE_URL  http://localhost:4000      -> http://localhost:4000/api
 *                       http://localhost:4000/api  -> http://localhost:4000/api
 *  - Neither set        -> "/api" (Vite dev proxy fallback)
 */
function resolveBaseURL(): string {
  const candidate = (
    (import.meta.env.VITE_API_URL as string | undefined) ??
    (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
    ''
  )
    .trim()
    .replace(/\/+$/, '');
  if (!candidate) return '/api';
  if (candidate === '/api' || candidate.endsWith('/api')) return candidate;
  return `${candidate}/api`;
}

const baseURL = resolveBaseURL();

export const apiClient = axios.create({
  baseURL,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ---- Access-token refresh on 401 (single-flight) ----
let refreshPromise: Promise<string | null> | null = null;

async function requestNewToken(): Promise<string | null> {
  const { refreshToken } = useAuthStore.getState();
  if (!refreshToken) return null;
  try {
    const { data } = await axios.post<{ success: boolean; data: AuthSession }>(
      `${baseURL}/auth/refresh`,
      { refreshToken },
    );
    const session = data.data;
    useAuthStore.getState().setSession(session);
    return session.accessToken;
  } catch {
    useAuthStore.getState().clearSession();
    return null;
  }
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiResponse<never>>) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined;
    const status = error.response?.status;

    const isAuthEndpoint = original?.url?.includes('/auth/') ?? false;
    if (status === 401 && original && !original._retried && !isAuthEndpoint) {
      original._retried = true;
      refreshPromise = refreshPromise ?? requestNewToken().finally(() => {
        refreshPromise = null;
      });
      const newToken = await refreshPromise;
      if (newToken) {
        original.headers.Authorization = `Bearer ${newToken}`;
        return apiClient(original);
      }
    }

    return Promise.reject(error);
  },
);

/** User-friendly messages grouped by the backend's error codes. */
const ERROR_CODE_MESSAGES: Record<string, string> = {
  NOT_FOUND: 'Login service is unavailable. Please check the backend API configuration.',
  TENANT_NOT_FOUND: 'Workspace not found. Check your workspace identifier and try again.',
  ORG_SUSPENDED: 'This organization is no longer active.',
  USER_DISABLED: 'This account has been disabled. Contact your administrator.',
  INVALID_CREDENTIALS: 'Invalid email or password.',
  INSUFFICIENT_ROLE: 'Your account does not have access to this workspace.',
  RATE_LIMITED: 'Too many requests. Please wait a moment and try again.',
  INVALID_ACCESS_TOKEN: 'Your session has expired. Please sign in again.',
  INVALID_REFRESH_TOKEN: 'Your session has expired. Please sign in again.',
};

/** User-friendly fallbacks keyed by HTTP status code. */
const HTTP_STATUS_MESSAGES: Record<number, string> = {
  400: 'The request was invalid. Please check your input and try again.',
  401: 'Invalid email or password.',
  403: 'Your account does not have access to this workspace.',
  404: 'Workspace not found, or login service is unavailable.',
  409: 'A record with those details already exists.',
  429: 'Too many requests. Please wait a moment and try again.',
  500: 'Something went wrong on the server. Please try again.',
};

/**
 * Convert an unknown error into an understandable user-facing message.
 * Raw Axios messages (e.g. "Request failed with status code 404") are never
 * shown to users. Detailed technical errors remain available to developers via
 * `err` in the console only.
 */
export function apiErrorMessage(err: unknown, fallback = 'Something went wrong'): string {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status;
    const data = err.response?.data as ApiResponse<never> | undefined;
    const code = data?.error?.code;
    const apiMsg = data?.error?.message;

    // No HTTP status -> network-level failure.
    if (!status) {
      if (err.code === 'ERR_NETWORK' || err.code === 'ECONNABORTED' || err.message === 'Network Error') {
        return 'Unable to connect to LedgerGuard. Make sure the backend server is running.';
      }
      return err.message || fallback;
    }

    // Prefer specific backend error codes when known.
    if (code && ERROR_CODE_MESSAGES[code]) return ERROR_CODE_MESSAGES[code];

    // For 4xx validation responses keep the server's detailed message.
    if (status === 400 && apiMsg) return apiMsg;

    return HTTP_STATUS_MESSAGES[status] ?? apiMsg ?? fallback;
  }
  if (err instanceof Error) return err.message;
  return fallback;
}