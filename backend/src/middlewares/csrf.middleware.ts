import { Request, Response, NextFunction } from 'express';
import { COOKIE_NAMES, generateCsrfToken } from '../utils/cookies';
import { ForbiddenError } from './error.middleware';
import { env } from '../config/env';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  // Ensure an XSRF-TOKEN cookie exists on safe GET/HEAD requests
  if (SAFE_METHODS.has(req.method)) {
    if (!req.cookies?.[COOKIE_NAMES.CSRF_TOKEN]) {
      const csrfToken = generateCsrfToken();
      res.cookie(COOKIE_NAMES.CSRF_TOKEN, csrfToken, {
        httpOnly: false,
        secure: env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });
    }
    next();
    return;
  }

  // Exempt device endpoints & signature authenticated requests
  if (
    req.headers['x-device-id'] ||
    req.headers['x-signature'] ||
    req.path.startsWith('/api/scan') ||
    req.path.startsWith('/api/devices')
  ) {
    next();
    return;
  }

  // If explicit Bearer token is provided in Authorization header, CSRF attacks cannot occur
  // because browsers do not automatically send custom Authorization headers.
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    next();
    return;
  }

  // If the request does not carry any auth cookies, ambient cookie exploitation is impossible
  const hasAuthCookie = Boolean(
    req.cookies?.[COOKIE_NAMES.ACCESS_TOKEN] || req.cookies?.[COOKIE_NAMES.REFRESH_TOKEN]
  );

  if (!hasAuthCookie) {
    next();
    return;
  }

  // For cookie-authenticated state-changing requests, enforce double-submit CSRF token
  const cookieCsrfToken = req.cookies?.[COOKIE_NAMES.CSRF_TOKEN];
  const headerCsrfToken = (req.headers['x-csrf-token'] || req.headers['x-xsrf-token']) as string;

  if (!cookieCsrfToken || !headerCsrfToken || cookieCsrfToken !== headerCsrfToken) {
    next(new ForbiddenError('Invalid or missing CSRF token'));
    return;
  }

  next();
}
