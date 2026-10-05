import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { db } from '../db/connection';
import { comparePassword } from '../utils/crypto';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/jwt';
import { authenticateJWT } from '../middlewares/auth.middleware';
import { loginLimiter } from '../middlewares/rateLimiter';
import { AppError, UnauthorizedError } from '../middlewares/error.middleware';
import { logAudit, getClientIp } from '../services/audit.service';
import { AdminRole, AuthUserPayload } from '../types';

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

// POST /api/auth/login
router.post(
  '/login',
  loginLimiter,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { email, password } = loginSchema.parse(req.body);

      const user = await db('admin_users')
        .where({ email: email.toLowerCase().trim() })
        .first();

      if (!user) {
        throw new UnauthorizedError('Invalid email or password');
      }

      if (!user.is_active) {
        throw new UnauthorizedError('This account has been deactivated');
      }

      const isValid = await comparePassword(password, user.password_hash);
      if (!isValid) {
        throw new UnauthorizedError('Invalid email or password');
      }

      const payload: AuthUserPayload = {
        id: Number(user.id),
        email: user.email,
        name: user.name,
        role: user.role as AdminRole,
      };

      const accessToken = signAccessToken(payload);
      const refreshToken = signRefreshToken(payload);

      await logAudit({
        adminId: user.id,
        action: 'AUTH_LOGIN',
        targetType: 'ADMIN_USER',
        targetId: user.id,
        detail: { email: user.email, role: user.role },
        ip: getClientIp(req),
      });

      res.json({
        user: payload,
        accessToken,
        refreshToken,
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/auth/refresh
router.post(
  '/refresh',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { refreshToken } = refreshSchema.parse(req.body);

      let payload: AuthUserPayload;
      try {
        payload = verifyRefreshToken(refreshToken);
      } catch (err) {
        throw new UnauthorizedError('Invalid or expired refresh token');
      }

      const user = await db('admin_users')
        .where({ id: payload.id, is_active: true })
        .first();

      if (!user) {
        throw new UnauthorizedError('User account not found or deactivated');
      }

      const newPayload: AuthUserPayload = {
        id: Number(user.id),
        email: user.email,
        name: user.name,
        role: user.role as AdminRole,
      };

      const newAccessToken = signAccessToken(newPayload);
      const newRefreshToken = signRefreshToken(newPayload);

      res.json({
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        user: newPayload,
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/auth/logout
router.post(
  '/logout',
  authenticateJWT,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (req.user) {
        await logAudit({
          adminId: req.user.id,
          action: 'AUTH_LOGOUT',
          targetType: 'ADMIN_USER',
          targetId: req.user.id,
          ip: getClientIp(req),
        });
      }

      res.json({ success: true, message: 'Logged out successfully' });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/auth/me
router.get(
  '/me',
  authenticateJWT,
  async (req: Request, res: Response): Promise<void> => {
    res.json({ user: req.user });
  }
);

export default router;
