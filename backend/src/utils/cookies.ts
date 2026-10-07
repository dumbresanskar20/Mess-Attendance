import { Response, CookieOptions } from 'express';
import crypto from 'crypto';
import { env } from '../config/env';

const isProduction = env.NODE_ENV === 'production';

export const COOKIE_NAMES = {
  ACCESS_TOKEN: 'access_token',
  REFRESH_TOKEN: 'refresh_token',
  CSRF_TOKEN: 'XSRF-TOKEN',
} as const;

export function getBaseCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
  };
}

export function generateCsrfToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Sets access_token and refresh_token in httpOnly, Secure, SameSite=Strict cookies,
 * and sets the readable XSRF-TOKEN cookie for double-submit CSRF verification.
 */
export function setAuthCookies(
  res: Response,
  accessToken: string,
  refreshToken?: string
): string {
  const csrfToken = generateCsrfToken();

  // Access token cookie (15 minutes)
  res.cookie(COOKIE_NAMES.ACCESS_TOKEN, accessToken, {
    ...getBaseCookieOptions(),
    path: '/',
    maxAge: 15 * 60 * 1000,
  });

  // Refresh token cookie (7 days)
  if (refreshToken) {
    res.cookie(COOKIE_NAMES.REFRESH_TOKEN, refreshToken, {
      ...getBaseCookieOptions(),
      path: '/api/auth',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
  }

  // Double-submit CSRF token (Readable by JavaScript for custom header)
  res.cookie(COOKIE_NAMES.CSRF_TOKEN, csrfToken, {
    httpOnly: false,
    secure: isProduction,
    sameSite: 'strict',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  return csrfToken;
}

/**
 * Clears all authentication cookies.
 */
export function clearAuthCookies(res: Response): void {
  res.clearCookie(COOKIE_NAMES.ACCESS_TOKEN, {
    ...getBaseCookieOptions(),
    path: '/',
  });

  res.clearCookie(COOKIE_NAMES.REFRESH_TOKEN, {
    ...getBaseCookieOptions(),
    path: '/api/auth',
  });

  res.clearCookie(COOKIE_NAMES.CSRF_TOKEN, {
    httpOnly: false,
    secure: isProduction,
    sameSite: 'strict',
    path: '/',
  });
}
