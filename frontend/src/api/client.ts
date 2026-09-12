/**
 * The single axios instance for the whole application.
 *
 * Every component talks to the API through the typed modules next to this file,
 * never with its own fetch/axios call. That is what makes the base URL a
 * one-line change between local development, Docker and CloudFront
 * (RESTRICTIONS.md #34).
 */
import axios, { AxiosError } from 'axios';
import type { ApiErrorBody } from '@/types/api';

/**
 * Resolution order:
 *  1. VITE_API_BASE_URL baked in at build time (deploy.sh sets it to the
 *     CloudFront origin, so the browser stays on one domain).
 *  2. '/api/v1' — the Vite dev proxy locally, CloudFront's /api/* behaviour in
 *     production.
 */
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1';

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 20000,
  headers: { Accept: 'application/json' },
});

const TOKEN_STORAGE_KEY = 'mjb.admin.token';

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    // Private browsing modes can throw on storage access.
    return null;
  }
}

export function setStoredToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_STORAGE_KEY, token);
    else localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    /* storage unavailable: the session simply does not survive a reload */
  }
}

// Attach the admin token to every request that has one. The token lives in a
// header, never in a cookie, so there is no CSRF surface to defend.
api.interceptors.request.use((config) => {
  const token = getStoredToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

/** A normalised error the UI can render without knowing about axios. */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly fields: Record<string, string>;
  readonly requestId: string;

  constructor(message: string, code: string, status: number, fields: Record<string, string> = {}, requestId = '') {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.fields = fields;
    this.requestId = requestId;
  }
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;

  const axiosError = error as AxiosError<ApiErrorBody>;
  if (axiosError?.isAxiosError) {
    const body = axiosError.response?.data;
    if (body?.error) {
      return new ApiError(
        body.error.message,
        body.error.code,
        axiosError.response?.status ?? 0,
        body.error.details?.fields ?? {},
        body.request_id,
      );
    }
    if (axiosError.code === 'ECONNABORTED') {
      return new ApiError('The request timed out. Please try again.', 'TIMEOUT', 0);
    }
    if (!axiosError.response) {
      return new ApiError('Could not reach the server. Check your connection and try again.', 'NETWORK_ERROR', 0);
    }
    return new ApiError(axiosError.message, 'HTTP_ERROR', axiosError.response.status);
  }

  return new ApiError('Something went wrong. Please try again.', 'UNKNOWN_ERROR', 0);
}

// A 401 anywhere means the stored token is gone or expired. Clearing it here
// keeps every admin page from having to handle expiry itself; ProtectedRoute
// then redirects on the next render.
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) setStoredToken(null);
    return Promise.reject(toApiError(error));
  },
);
