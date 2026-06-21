/**
 * Lightweight fetch-based API client.
 * Bearer token is injected per-request since FinVault is a local-first app
 * and the token is stored in SQLite.
 *
 * BASE_URL is read from app.json "extra.apiBaseUrl" (set via expo-constants)
 * so it can be overridden per environment without a code change.
 */
import Constants from 'expo-constants';

const BASE_URL: string =
  (Constants.expoConfig?.extra as Record<string, string> | undefined)?.apiBaseUrl ??
  'https://api.finvault.local';

export interface ApiResponse<T> {
  data: T | null;
  error: string | null;
}

async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  token?: string,
  signal?: AbortSignal,
): Promise<ApiResponse<T>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  try {
    const res = await fetch(`${BASE_URL}${path}`, { ...options, headers, signal });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { data: null, error: body || `HTTP ${res.status}` };
    }
    const data: T = await res.json();
    return { data, error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : 'Network error' };
  }
}

export const apiGet = <T>(path: string, token?: string, signal?: AbortSignal) =>
  apiFetch<T>(path, { method: 'GET' }, token, signal);

export const apiPost = <T>(path: string, body: unknown, token?: string, signal?: AbortSignal) =>
  apiFetch<T>(path, { method: 'POST', body: JSON.stringify(body) }, token, signal);

export const apiPut = <T>(path: string, body: unknown, token?: string, signal?: AbortSignal) =>
  apiFetch<T>(path, { method: 'PUT', body: JSON.stringify(body) }, token, signal);

export const apiDelete = <T>(path: string, token?: string, signal?: AbortSignal) =>
  apiFetch<T>(path, { method: 'DELETE' }, token, signal);
