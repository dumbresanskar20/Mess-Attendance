import { APP_URLS } from '../config/urls';

export const BACKEND_URL: string = (
  import.meta.env.VITE_BACKEND_URL ||
  (typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:4000'
    : APP_URLS.backend)
).replace(/\/+$/, '');

export const BASE_URL: string = (
  import.meta.env.VITE_API_URL ||
  (typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? '/api'
    : `${BACKEND_URL}/api`)
).replace(/\/+$/, '');

function getCsrfTokenFromCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

function handleAuthFailure() {
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
  localStorage.removeItem('user');

  // Guard against infinite reload loop: NEVER redirect or reload if already on /login
  if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
    window.location.href = '/login';
  }
}

export async function apiRequest<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('access_token') : null;
  const headers = new Headers(options.headers || {});

  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  // Include Bearer header if present in localStorage
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  // Include double-submit CSRF header for mutation methods
  const method = (options.method || 'GET').toUpperCase();
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    const csrfToken = getCsrfTokenFromCookie() || (typeof localStorage !== 'undefined' ? localStorage.getItem('csrf_token') : null);
    if (csrfToken && !headers.has('x-csrf-token')) {
      headers.set('x-csrf-token', csrfToken);
    }
  }

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${endpoint}`, {
      ...options,
      credentials: 'include', // Always send and receive httpOnly cookies
      headers,
    });
  } catch (err: any) {
    throw new Error(err.message || 'Network error connecting to server');
  }

  // Attempt refresh if 401
  if (
    response.status === 401 &&
    !endpoint.includes('/auth/login') &&
    !endpoint.includes('/auth/refresh')
  ) {
    const refreshToken = typeof localStorage !== 'undefined' ? localStorage.getItem('refresh_token') : null;
    const csrfToken = getCsrfTokenFromCookie() || (typeof localStorage !== 'undefined' ? localStorage.getItem('csrf_token') : null);

    try {
      const refreshHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
      if (csrfToken) refreshHeaders['x-csrf-token'] = csrfToken;

      const refreshRes = await fetch(`${BASE_URL}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: refreshHeaders,
        body: JSON.stringify(refreshToken ? { refreshToken } : {}),
      });

      if (refreshRes.ok) {
        const data = await refreshRes.json();
        if (data.accessToken) {
          localStorage.setItem('access_token', data.accessToken);
          headers.set('Authorization', `Bearer ${data.accessToken}`);
        }
        if (data.refreshToken) {
          localStorage.setItem('refresh_token', data.refreshToken);
        }
        if (data.csrfToken) {
          localStorage.setItem('csrf_token', data.csrfToken);
        }

        // Retry original request with credentials and updated headers
        response = await fetch(`${BASE_URL}${endpoint}`, {
          ...options,
          credentials: 'include',
          headers,
        });
      } else {
        handleAuthFailure();
      }
    } catch {
      handleAuthFailure();
    }
  }

  // Handle empty or non-JSON responses safely
  const contentType = response.headers.get('content-type');
  let data: any = null;
  if (contentType && contentType.includes('application/json')) {
    try {
      data = await response.json();
    } catch {
      data = null;
    }
  } else {
    data = await response.text();
  }

  if (!response.ok) {
    const errorMsg =
      (data && typeof data === 'object' && data.error?.message) ||
      (typeof data === 'string' && data) ||
      'An error occurred with the request';
    throw new Error(errorMsg);
  }

  return data as T;
}
