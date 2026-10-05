import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/jwt';
import { UnauthorizedError, ForbiddenError } from './error.middleware';
import { AdminRole, AuthUserPayload } from '../types';
import { db } from '../db/connection';

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
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    next(new UnauthorizedError('Missing or malformed Authorization header'));
    return;
  }

  const token = authHeader.split(' ')[1];

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
    };

    next();
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      next(new UnauthorizedError('Access token has expired'));
      return;
    }
    next(new UnauthorizedError('Invalid access token'));
  }
}

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
