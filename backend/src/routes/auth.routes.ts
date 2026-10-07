import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { db } from '../db/connection';
import { comparePassword, hashPassword } from '../utils/crypto';
import { signAccessToken } from '../utils/jwt';
import { authenticateJWT, requireRole } from '../middlewares/auth.middleware';
import { loginLimiter } from '../middlewares/rateLimiter';
import { AppError, UnauthorizedError } from '../middlewares/error.middleware';
import { logAudit, getClientIp } from '../services/audit.service';
import { AdminRole, AuthUserPayload } from '../types';
import { COOKIE_NAMES, setAuthCookies, clearAuthCookies } from '../utils/cookies';
import {
  createRefreshTokenSession,
  rotateRefreshTokenSession,
  revokeRefreshTokenSession,
  revokeAllUserSessions,
} from '../services/session.service';
import { generateTotpSecret, verifyTotpToken } from '../utils/totp';

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  totpCode: z.string().optional(),
});

const refreshSchema = z.object({
  refreshToken: z.string().optional(),
});

const initialSetupSchema = z.object({
  name: z.string().min(1, 'Name is required').trim(),
  email: z.string().email('Invalid email address').trim(),
  password: z.string().min(8, 'Password must be at least 8 characters long'),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters long'),
});

const verify2FASchema = z.object({
  code: z.string().length(6, '2FA code must be exactly 6 digits'),
});

// GET /api/auth/setup-status - Check if initial owner setup is required
router.get(
  '/setup-status',
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const ownerCountRow = await db('admin_users')
        .where({ role: 'OWNER', is_active: true })
        .count<{ count: number | string }>('id as count')
        .first();

      const ownerCount = Number(ownerCountRow?.count || 0);
      res.json({
        setupRequired: ownerCount === 0,
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/auth/initial-setup - One-time setup for first OWNER
router.post(
  '/initial-setup',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { name, email, password } = initialSetupSchema.parse(req.body);

      const ownerCountRow = await db('admin_users')
        .where({ role: 'OWNER', is_active: true })
        .count<{ count: number | string }>('id as count')
        .first();

      const ownerCount = Number(ownerCountRow?.count || 0);
      if (ownerCount > 0) {
        throw new AppError('Initial setup has already been completed', 400, 'SETUP_ALREADY_COMPLETED');
      }

      const normalizedEmail = email.toLowerCase();
      const existingUser = await db('admin_users').where({ email: normalizedEmail }).first();
      if (existingUser) {
        throw new AppError('A user with this email already exists', 409, 'USER_EXISTS');
      }

      const passwordHash = await hashPassword(password);
      const [newUserId] = await db('admin_users').insert({
        name,
        email: normalizedEmail,
        password_hash: passwordHash,
        role: 'OWNER',
        is_active: true,
        must_change_password: false,
        failed_login_attempts: 0,
        totp_enabled: false,
        created_at: new Date(),
      });

      const payload: AuthUserPayload = {
        id: Number(newUserId),
        email: normalizedEmail,
        name,
        role: 'OWNER',
        mustChangePassword: false,
      };

      const accessToken = signAccessToken(payload);
      const session = await createRefreshTokenSession(payload);

      const csrfToken = setAuthCookies(res, accessToken, session.refreshToken);

      await logAudit({
        adminId: newUserId,
        action: 'SETUP_INITIAL_OWNER',
        targetType: 'ADMIN_USER',
        targetId: newUserId,
        detail: { email: normalizedEmail, name },
        ip: getClientIp(req),
      });

      res.status(201).json({
        user: payload,
        accessToken,
        refreshToken: session.refreshToken,
        mustChangePassword: false,
        csrfToken,
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/auth/login
router.post(
  '/login',
  loginLimiter,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { email, password, totpCode } = loginSchema.parse(req.body);
      const normalizedEmail = email.toLowerCase().trim();

      const user = await db('admin_users')
        .where({ email: normalizedEmail })
        .first();

      if (!user) {
        await logAudit({
          action: 'LOGIN_FAILED',
          targetType: 'ADMIN_USER',
          detail: { email: normalizedEmail, reason: 'User not found' },
          ip: getClientIp(req),
        });
        throw new UnauthorizedError('Invalid email or password');
      }

      if (!user.is_active) {
        await logAudit({
          adminId: user.id,
          action: 'LOGIN_FAILED',
          targetType: 'ADMIN_USER',
          targetId: user.id,
          detail: { email: user.email, reason: 'Account deactivated' },
          ip: getClientIp(req),
        });
        throw new UnauthorizedError('This account has been deactivated');
      }

      // Check account lockout
      if (user.locked_until && new Date(user.locked_until) > new Date()) {
        const remainingMinutes = Math.max(
          1,
          Math.ceil((new Date(user.locked_until).getTime() - Date.now()) / (60 * 1000))
        );

        await logAudit({
          adminId: user.id,
          action: 'LOGIN_LOCKED_ATTEMPT',
          targetType: 'ADMIN_USER',
          targetId: user.id,
          detail: { email: user.email, lockedUntil: user.locked_until, remainingMinutes },
          ip: getClientIp(req),
        });

        throw new AppError(
          `Account is temporarily locked due to 5 consecutive failed login attempts. Please try again in ${remainingMinutes} minute(s).`,
          423,
          'ACCOUNT_LOCKED'
        );
      }

      const isValid = await comparePassword(password, user.password_hash);
      if (!isValid) {
        const failedAttempts = (Number(user.failed_login_attempts) || 0) + 1;

        if (failedAttempts >= 5) {
          const lockedUntil = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes lockout
          await db('admin_users')
            .where({ id: user.id })
            .update({
              failed_login_attempts: failedAttempts,
              locked_until: lockedUntil,
            });

          await logAudit({
            adminId: user.id,
            action: 'ACCOUNT_LOCKED',
            targetType: 'ADMIN_USER',
            targetId: user.id,
            detail: { email: user.email, attempts: failedAttempts, lockDurationMinutes: 15 },
            ip: getClientIp(req),
          });

          await logAudit({
            adminId: user.id,
            action: 'LOGIN_FAILED',
            targetType: 'ADMIN_USER',
            targetId: user.id,
            detail: { email: user.email, attempts: failedAttempts, reason: 'Password mismatch' },
            ip: getClientIp(req),
          });

          throw new AppError(
            'Account is now locked for 15 minutes due to 5 failed login attempts.',
            423,
            'ACCOUNT_LOCKED'
          );
        } else {
          await db('admin_users')
            .where({ id: user.id })
            .update({
              failed_login_attempts: failedAttempts,
            });

          await logAudit({
            adminId: user.id,
            action: 'LOGIN_FAILED',
            targetType: 'ADMIN_USER',
            targetId: user.id,
            detail: {
              email: user.email,
              attempt: failedAttempts,
              remainingAttempts: 5 - failedAttempts,
              reason: 'Password mismatch',
            },
            ip: getClientIp(req),
          });

          throw new UnauthorizedError('Invalid email or password');
        }
      }

      // Check TOTP 2FA for accounts with 2FA enabled
      if (user.totp_enabled) {
        if (!totpCode) {
          res.json({
            requires2FA: true,
            email: user.email,
            message: 'Two-factor authentication code required',
          });
          return;
        }

        const is2FAValid = user.totp_secret
          ? verifyTotpToken(user.totp_secret, totpCode)
          : false;

        if (!is2FAValid) {
          await logAudit({
            adminId: user.id,
            action: 'LOGIN_FAILED',
            targetType: 'ADMIN_USER',
            targetId: user.id,
            detail: { email: user.email, reason: 'Invalid 2FA code' },
            ip: getClientIp(req),
          });
          throw new UnauthorizedError('Invalid 2FA verification code');
        }
      }

      // Successful login: reset failed login attempts and unlock
      if (user.failed_login_attempts > 0 || user.locked_until) {
        await db('admin_users')
          .where({ id: user.id })
          .update({
            failed_login_attempts: 0,
            locked_until: null,
          });
      }

      const payload: AuthUserPayload = {
        id: Number(user.id),
        email: user.email,
        name: user.name,
        role: user.role as AdminRole,
        mustChangePassword: Boolean(user.must_change_password),
      };

      const accessToken = signAccessToken(payload);
      const session = await createRefreshTokenSession(payload);

      const csrfToken = setAuthCookies(res, accessToken, session.refreshToken);

      await logAudit({
        adminId: user.id,
        action: 'AUTH_LOGIN',
        targetType: 'ADMIN_USER',
        targetId: user.id,
        detail: { email: user.email, role: user.role, twoFactorUsed: Boolean(user.totp_enabled) },
        ip: getClientIp(req),
      });

      res.json({
        user: payload,
        accessToken,
        refreshToken: session.refreshToken,
        mustChangePassword: Boolean(user.must_change_password),
        csrfToken,
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/auth/refresh - Rotate refresh token with reuse detection
router.post(
  '/refresh',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = refreshSchema.safeParse(req.body);
      const tokenFromCookie = req.cookies?.[COOKIE_NAMES.REFRESH_TOKEN];
      const tokenFromBody = parsed.success ? parsed.data.refreshToken : undefined;
      const rawRefreshToken = tokenFromCookie || tokenFromBody;

      if (!rawRefreshToken) {
        throw new UnauthorizedError('No refresh token provided');
      }

      const { newRefreshToken, user } = await rotateRefreshTokenSession(
        rawRefreshToken,
        getClientIp(req)
      );

      const newAccessToken = signAccessToken(user);
      const csrfToken = setAuthCookies(res, newAccessToken, newRefreshToken);

      res.json({
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        user,
        mustChangePassword: Boolean(user.mustChangePassword),
        csrfToken,
      });
    } catch (error) {
      clearAuthCookies(res);
      next(error);
    }
  }
);

// POST /api/auth/logout - Revoke current refresh token session
router.post(
  '/logout',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tokenFromCookie = req.cookies?.[COOKIE_NAMES.REFRESH_TOKEN];
      const tokenFromBody = req.body?.refreshToken;
      const rawRefreshToken = tokenFromCookie || tokenFromBody;

      if (rawRefreshToken) {
        await revokeRefreshTokenSession(rawRefreshToken);
      }

      if (req.user) {
        await logAudit({
          adminId: req.user.id,
          action: 'AUTH_LOGOUT',
          targetType: 'ADMIN_USER',
          targetId: req.user.id,
          ip: getClientIp(req),
        });
      }

      clearAuthCookies(res);
      res.json({ success: true, message: 'Logged out successfully' });
    } catch (error) {
      clearAuthCookies(res);
      next(error);
    }
  }
);

// POST /api/auth/revoke-all-sessions - Revoke ALL active sessions for user
router.post(
  '/revoke-all-sessions',
  authenticateJWT,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new UnauthorizedError('Unauthorized');
      }

      const count = await revokeAllUserSessions(req.user.id, getClientIp(req));
      clearAuthCookies(res);

      res.json({
        success: true,
        message: `Successfully revoked all ${count} active session(s).`,
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/auth/change-password
router.post(
  '/change-password',
  authenticateJWT,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new UnauthorizedError('Unauthorized');
      }

      const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);

      const user = await db('admin_users').where({ id: req.user.id }).first();
      if (!user || !user.is_active) {
        throw new UnauthorizedError('User account not found or deactivated');
      }

      const isCurrentValid = await comparePassword(currentPassword, user.password_hash);
      if (!isCurrentValid) {
        throw new UnauthorizedError('Current password is incorrect');
      }

      const newPasswordHash = await hashPassword(newPassword);

      await db('admin_users').where({ id: user.id }).update({
        password_hash: newPasswordHash,
        must_change_password: false,
        failed_login_attempts: 0,
        locked_until: null,
      });

      await logAudit({
        adminId: user.id,
        action: 'PASSWORD_CHANGED',
        targetType: 'ADMIN_USER',
        targetId: user.id,
        detail: { email: user.email },
        ip: getClientIp(req),
      });

      res.json({
        success: true,
        message: 'Password changed successfully',
      });
    } catch (error) {
      next(error);
    }
  }
);

// --- TOTP 2FA Routes (Owner Accounts) ---

// GET /api/auth/2fa/status - Check 2FA status for authenticated user
router.get(
  '/2fa/status',
  authenticateJWT,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new UnauthorizedError('Unauthorized');
      }

      const user = await db('admin_users').where({ id: req.user.id }).first();
      res.json({
        enabled: Boolean(user?.totp_enabled),
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/auth/2fa/setup - Generate TOTP secret and setup URI
router.post(
  '/2fa/setup',
  authenticateJWT,
  requireRole('OWNER'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new UnauthorizedError('Unauthorized');
      }

      const { secret, otpauthUrl } = generateTotpSecret(req.user.email, 'MessTokens');

      // Temporarily store secret until verified and enabled
      await db('admin_users').where({ id: req.user.id }).update({
        totp_secret: secret,
      });

      res.json({
        secret,
        otpauthUrl,
        message: 'Scan the QR code or enter the secret key into your Authenticator app, then verify with a 6-digit code.',
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/auth/2fa/enable - Verify code and enable 2FA
router.post(
  '/2fa/enable',
  authenticateJWT,
  requireRole('OWNER'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new UnauthorizedError('Unauthorized');
      }

      const { code } = verify2FASchema.parse(req.body);
      const user = await db('admin_users').where({ id: req.user.id }).first();

      if (!user?.totp_secret) {
        throw new AppError('2FA setup has not been initiated. Please run setup first.', 400, '2FA_NOT_INITIALIZED');
      }

      const isValid = verifyTotpToken(user.totp_secret, code);
      if (!isValid) {
        throw new UnauthorizedError('Invalid 2FA verification code');
      }

      await db('admin_users').where({ id: req.user.id }).update({
        totp_enabled: true,
      });

      await logAudit({
        adminId: req.user.id,
        action: '2FA_ENABLED',
        targetType: 'ADMIN_USER',
        targetId: req.user.id,
        detail: { email: user.email },
        ip: getClientIp(req),
      });

      res.json({
        success: true,
        message: 'Two-factor authentication enabled successfully.',
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/auth/2fa/disable - Disable 2FA
router.post(
  '/2fa/disable',
  authenticateJWT,
  requireRole('OWNER'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new UnauthorizedError('Unauthorized');
      }

      const { code } = verify2FASchema.parse(req.body);
      const user = await db('admin_users').where({ id: req.user.id }).first();

      if (!user?.totp_enabled || !user.totp_secret) {
        throw new AppError('2FA is not currently enabled on this account', 400, '2FA_NOT_ENABLED');
      }

      const isValid = verifyTotpToken(user.totp_secret, code);
      if (!isValid) {
        throw new UnauthorizedError('Invalid 2FA verification code');
      }

      await db('admin_users').where({ id: req.user.id }).update({
        totp_enabled: false,
        totp_secret: null,
      });

      await logAudit({
        adminId: req.user.id,
        action: '2FA_DISABLED',
        targetType: 'ADMIN_USER',
        targetId: req.user.id,
        detail: { email: user.email },
        ip: getClientIp(req),
      });

      res.json({
        success: true,
        message: 'Two-factor authentication has been disabled.',
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/auth/me
router.get(
  '/me',
  authenticateJWT,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new UnauthorizedError('Unauthorized');
      }

      const user = await db('admin_users')
        .where({ id: req.user.id, is_active: true })
        .first();

      if (!user) {
        throw new UnauthorizedError('User account not found or deactivated');
      }

      const payload: AuthUserPayload = {
        id: Number(user.id),
        email: user.email,
        name: user.name,
        role: user.role as AdminRole,
        mustChangePassword: Boolean(user.must_change_password),
      };

      res.json({
        user: payload,
        mustChangePassword: Boolean(user.must_change_password),
        totpEnabled: Boolean(user.totp_enabled),
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
