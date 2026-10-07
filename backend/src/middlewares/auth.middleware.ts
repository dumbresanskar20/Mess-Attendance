import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/jwt';
import { UnauthorizedError, ForbiddenError } from './error.middleware';
import { AdminRole, AuthUserPayload } from '../types';
import { db } from '../db/connection';
import { COOKIE_NAMES } from '../utils/cookies';

declare global {
  namespace Express {
    interface Request {
      user?: AuthUserPayload;
    }
  }
}

export async function authenticateJWT(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  let token: string | undefined;

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (req.cookies && req.cookies[COOKIE_NAMES.ACCESS_TOKEN]) {
    token = req.cookies[COOKIE_NAMES.ACCESS_TOKEN];
  }

  if (!token) {
    next(new UnauthorizedError('Missing or malformed Authorization header'));
    return;
  }

  try {
    const payload = verifyAccessToken(token);

    // Verify user is still active in database
    const user = await db('admin_users')
      .where({ id: payload.id, is_active: true })
      .first();

    if (!user) {
      next(new UnauthorizedError('User account not found or deactivated'));
      return;
    }

    req.user = {
      id: Number(user.id),
      email: user.email,
      name: user.name,
      role: user.role as AdminRole,
      mustChangePassword: Boolean(user.must_change_password),
    };

    next();
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      next(new UnauthorizedError('Access token has expired'));
      return;
    }
    next(new UnauthorizedError('Invalid access token'));
  }
};

export function requireRole(roles: AdminRole | AdminRole[]) {
  const allowedRoles = Array.isArray(roles) ? roles : [roles];

  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new UnauthorizedError('Authentication required'));
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      next(new ForbiddenError(`Operation not permitted for role ${req.user.role}`));
      return;
    }

    next();
  };
}
