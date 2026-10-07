import crypto from 'crypto';
import { db } from '../db/connection';
import { signRefreshToken, verifyRefreshToken } from '../utils/jwt';
import { AuthUserPayload } from '../types';
import { UnauthorizedError } from '../middlewares/error.middleware';
import { logAudit } from './audit.service';

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export interface SessionResult {
  refreshToken: string;
  familyId: string;
  expiresAt: Date;
}

/**
 * Creates a new refresh token and records it in the refresh_tokens table.
 */
export async function createRefreshTokenSession(
  user: AuthUserPayload,
  familyId?: string
): Promise<SessionResult> {
  const finalFamilyId = familyId || crypto.randomUUID();
  const rawRefreshToken = signRefreshToken(user);
  const tokenHash = hashToken(rawRefreshToken);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  await db('refresh_tokens').insert({
    admin_id: user.id,
    token_hash: tokenHash,
    family_id: finalFamilyId,
    is_revoked: false,
    expires_at: expiresAt,
    created_at: new Date(),
  });

  return {
    refreshToken: rawRefreshToken,
    familyId: finalFamilyId,
    expiresAt,
  };
}

/**
 * Rotates an existing refresh token with reuse detection.
 * If an already revoked token is used, all tokens in the family/user are immediately invalidated.
 */
export async function rotateRefreshTokenSession(
  rawOldRefreshToken: string,
  clientIp?: string
): Promise<{ newRefreshToken: string; user: AuthUserPayload }> {
  let payload: AuthUserPayload;
  try {
    payload = verifyRefreshToken(rawOldRefreshToken);
  } catch {
    throw new UnauthorizedError('Invalid or expired refresh token');
  }

  const oldHash = hashToken(rawOldRefreshToken);
  const existingTokenRow = await db('refresh_tokens')
    .where({ token_hash: oldHash })
    .first();

  if (!existingTokenRow) {
    throw new UnauthorizedError('Session record not found');
  }

  // REUSE DETECTION: If this token was already revoked, someone is replaying an old token!
  if (existingTokenRow.is_revoked) {
    // Revoke ALL active sessions for this family & user
    await db('refresh_tokens')
      .where({ admin_id: existingTokenRow.admin_id, is_revoked: false })
      .update({
        is_revoked: true,
        revoked_at: new Date(),
      });

    await logAudit({
      adminId: existingTokenRow.admin_id,
      action: 'SECURITY_ALERT_REFRESH_TOKEN_REUSE',
      targetType: 'ADMIN_USER',
      targetId: existingTokenRow.admin_id,
      detail: {
        familyId: existingTokenRow.family_id,
        reason: 'Revoked refresh token was presented; all sessions revoked for security',
      },
      ip: clientIp || null,
    });

    throw new UnauthorizedError(
      'Suspicious session activity detected (token reuse). All active sessions have been revoked for your security. Please log in again.'
    );
  }

  // Expiration check
  if (new Date(existingTokenRow.expires_at) <= new Date()) {
    await db('refresh_tokens').where({ id: existingTokenRow.id }).update({
      is_revoked: true,
      revoked_at: new Date(),
    });
    throw new UnauthorizedError('Refresh token session has expired');
  }

  // Fetch fresh user details
  const user = await db('admin_users')
    .where({ id: payload.id, is_active: true })
    .first();

  if (!user) {
    throw new UnauthorizedError('User account not found or deactivated');
  }

  const userPayload: AuthUserPayload = {
    id: Number(user.id),
    email: user.email,
    name: user.name,
    role: user.role,
    mustChangePassword: Boolean(user.must_change_password),
  };

  // Generate new refresh token under the same family
  const newRawRefreshToken = signRefreshToken(userPayload);
  const newHash = hashToken(newRawRefreshToken);
  const newExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  // Invalidate old token and link to new one
  await db('refresh_tokens')
    .where({ id: existingTokenRow.id })
    .update({
      is_revoked: true,
      revoked_at: new Date(),
      replaced_by_hash: newHash,
    });

  // Store new refresh token
  await db('refresh_tokens').insert({
    admin_id: user.id,
    token_hash: newHash,
    family_id: existingTokenRow.family_id,
    is_revoked: false,
    expires_at: newExpiresAt,
    created_at: new Date(),
  });

  return {
    newRefreshToken: newRawRefreshToken,
    user: userPayload,
  };
}

/**
 * Revokes a specific refresh token session (e.g. on user logout).
 */
export async function revokeRefreshTokenSession(rawRefreshToken: string): Promise<void> {
  const tokenHash = hashToken(rawRefreshToken);
  await db('refresh_tokens')
    .where({ token_hash: tokenHash })
    .update({
      is_revoked: true,
      revoked_at: new Date(),
    });
}

/**
 * Revokes ALL active sessions for an admin user.
 */
export async function revokeAllUserSessions(adminId: number | string, clientIp?: string): Promise<number> {
  const count = await db('refresh_tokens')
    .where({ admin_id: adminId, is_revoked: false })
    .update({
      is_revoked: true,
      revoked_at: new Date(),
    });

  await logAudit({
    adminId,
    action: 'REVOKE_ALL_SESSIONS',
    targetType: 'ADMIN_USER',
    targetId: adminId,
    detail: { sessionsRevoked: count },
    ip: clientIp || null,
  });

  return count;
}
