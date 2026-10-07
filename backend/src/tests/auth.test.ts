import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { db } from '../db/connection';
import { hashPassword } from '../utils/crypto';
import { generateTotpToken } from '../utils/totp';

const app = createApp();

describe('Auth API & Hardened Security Suite', () => {
  beforeAll(async () => {
    // Reset test user for predictable test state
    const testUserHash = await hashPassword('TestLockout@123');
    await db.raw('SET FOREIGN_KEY_CHECKS = 0;');
    await db('admin_users').where({ email: 'lockout_test@mess.local' }).del();
    await db('admin_users').where({ email: 'initial_setup_test@mess.local' }).del();
    await db('admin_users').where({ email: 'totp_owner_test@mess.local' }).del();
    await db.raw('SET FOREIGN_KEY_CHECKS = 1;');

    await db('admin_users').insert({
      name: 'Lockout Test User',
      email: 'lockout_test@mess.local',
      password_hash: testUserHash,
      role: 'COUNTER',
      is_active: true,
      must_change_password: false,
      failed_login_attempts: 0,
      locked_until: null,
      created_at: new Date(),
    });
  });

  afterAll(async () => {
    await db.raw('SET FOREIGN_KEY_CHECKS = 0;');
    await db('admin_users').where({ email: 'lockout_test@mess.local' }).del();
    await db('admin_users').where({ email: 'initial_setup_test@mess.local' }).del();
    await db('admin_users').where({ email: 'totp_owner_test@mess.local' }).del();
    await db.raw('SET FOREIGN_KEY_CHECKS = 1;');
  });

  it('should authenticate OWNER with valid credentials and set httpOnly cookies with CSRF token', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'owner@mess.local',
        password: 'Owner@123456',
      });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken');
    expect(res.body).toHaveProperty('refreshToken');
    expect(res.body.user).toMatchObject({
      email: 'owner@mess.local',
      role: 'OWNER',
    });

    // Verify Cookies
    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    const cookieString = Array.isArray(cookies) ? cookies.join(';') : String(cookies);
    expect(cookieString).toContain('access_token=');
    expect(cookieString).toContain('refresh_token=');
    expect(cookieString).toContain('XSRF-TOKEN=');
    expect(cookieString).toContain('HttpOnly');
    expect(cookieString).toContain('SameSite=Strict');
  });

  it('should authenticate COUNTER with valid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'counter@mess.local',
        password: 'Counter@123456',
      });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken');
    expect(res.body.user).toMatchObject({
      email: 'counter@mess.local',
      role: 'COUNTER',
    });
  });

  it('should reject invalid credentials with 401 UNAUTHORIZED and record audit log', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'owner@mess.local',
        password: 'IncorrectPassword',
      });

    expect(res.status).toBe(401);
    expect(res.body.error).toHaveProperty('code', 'UNAUTHORIZED');

    // Verify audit log
    const audit = await db('audit_log')
      .where({ action: 'LOGIN_FAILED' })
      .orderBy('id', 'desc')
      .first();

    expect(audit).toBeDefined();
    expect(audit.action).toBe('LOGIN_FAILED');
  });

  it('should lock account for 15 minutes after 5 failed login attempts', async () => {
    const email = 'lockout_test@mess.local';

    for (let i = 1; i <= 4; i++) {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email, password: 'WrongPassword' });

      expect(res.status).toBe(401);
    }

    const fifthRes = await request(app)
      .post('/api/auth/login')
      .send({ email, password: 'WrongPassword' });

    expect(fifthRes.status).toBe(423);
    expect(fifthRes.body.error.code).toBe('ACCOUNT_LOCKED');

    const lockedUser = await db('admin_users').where({ email }).first();
    expect(lockedUser.failed_login_attempts).toBe(5);
    expect(lockedUser.locked_until).not.toBeNull();

    const lockAudit = await db('audit_log')
      .where({ action: 'ACCOUNT_LOCKED', target_id: String(lockedUser.id) })
      .first();
    expect(lockAudit).toBeDefined();
  });

  it('should rotate refresh token and store session in database', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'owner@mess.local',
        password: 'Owner@123456',
      });

    const oldRefreshToken = loginRes.body.refreshToken;

    // Rotate token
    const refreshRes = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: oldRefreshToken });

    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body).toHaveProperty('accessToken');
    expect(refreshRes.body).toHaveProperty('refreshToken');
    const newRefreshToken = refreshRes.body.refreshToken;
    expect(newRefreshToken).not.toBe(oldRefreshToken);

    // Verify that new token works on subsequent refresh
    const secondRefreshRes = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: newRefreshToken });

    expect(secondRefreshRes.status).toBe(200);
  });

  it('should detect refresh token reuse and immediately revoke all user sessions', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'owner@mess.local',
        password: 'Owner@123456',
      });

    const initialRefreshToken = loginRes.body.refreshToken;

    // First rotation (valid)
    const validRefresh = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: initialRefreshToken });

    expect(validRefresh.status).toBe(200);
    const validNewToken = validRefresh.body.refreshToken;

    // Attacker tries to replay initialRefreshToken (which was already rotated/revoked!)
    const replayedAttempt = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: initialRefreshToken });

    expect(replayedAttempt.status).toBe(401);
    expect(replayedAttempt.body.error.message).toContain('reuse');

    // Because reuse was detected, the previously valid new token must NOW ALSO BE REVOKED!
    const revokedCheck = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: validNewToken });

    expect(revokedCheck.status).toBe(401);

    // Verify security alert audit log
    const reuseAudit = await db('audit_log')
      .where({ action: 'SECURITY_ALERT_REFRESH_TOKEN_REUSE' })
      .first();
    expect(reuseAudit).toBeDefined();
  });

  it('should revoke session on logout and clear cookies', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'owner@mess.local',
        password: 'Owner@123456',
      });

    const refreshToken = loginRes.body.refreshToken;
    const token = loginRes.body.accessToken;

    const logoutRes = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${token}`)
      .send({ refreshToken });

    expect(logoutRes.status).toBe(200);

    // Refreshing with logged-out token must fail
    const refreshRes = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken });

    expect(refreshRes.status).toBe(401);
  });

  it('should support revoke-all-sessions for active users', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'owner@mess.local',
        password: 'Owner@123456',
      });

    const token = loginRes.body.accessToken;
    const refreshToken = loginRes.body.refreshToken;

    const revokeRes = await request(app)
      .post('/api/auth/revoke-all-sessions')
      .set('Authorization', `Bearer ${token}`);

    expect(revokeRes.status).toBe(200);
    expect(revokeRes.body.success).toBe(true);

    // Refresh should now be rejected
    const refreshRes = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken });

    expect(refreshRes.status).toBe(401);
  });

  it('should support optional TOTP 2FA setup, enable, login, and disable flow for OWNER', async () => {
    const ownerHash = await hashPassword('TotpOwner@123');
    const [ownerId] = await db('admin_users').insert({
      name: 'TOTP Test Owner',
      email: 'totp_owner_test@mess.local',
      password_hash: ownerHash,
      role: 'OWNER',
      is_active: true,
      must_change_password: false,
      totp_enabled: false,
      failed_login_attempts: 0,
      created_at: new Date(),
    });

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'totp_owner_test@mess.local',
        password: 'TotpOwner@123',
      });

    const token = loginRes.body.accessToken;

    // 1. Setup 2FA
    const setupRes = await request(app)
      .post('/api/auth/2fa/setup')
      .set('Authorization', `Bearer ${token}`);

    expect(setupRes.status).toBe(200);
    expect(setupRes.body).toHaveProperty('secret');
    expect(setupRes.body).toHaveProperty('otpauthUrl');
    const secret = setupRes.body.secret;

    // 2. Enable 2FA with generated token
    const validCode = generateTotpToken(secret);
    const enableRes = await request(app)
      .post('/api/auth/2fa/enable')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: validCode });

    expect(enableRes.status).toBe(200);
    expect(enableRes.body.success).toBe(true);

    // 3. Login step 1: without 2FA code returns requires2FA
    const step1Res = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'totp_owner_test@mess.local',
        password: 'TotpOwner@123',
      });

    expect(step1Res.status).toBe(200);
    expect(step1Res.body.requires2FA).toBe(true);

    // 4. Login step 2: with invalid code fails
    const invalid2FARes = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'totp_owner_test@mess.local',
        password: 'TotpOwner@123',
        totpCode: '000000',
      });

    expect(invalid2FARes.status).toBe(401);

    // 5. Login step 2: with valid code succeeds
    const currentCode = generateTotpToken(secret);
    const valid2FARes = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'totp_owner_test@mess.local',
        password: 'TotpOwner@123',
        totpCode: currentCode,
      });

    expect(valid2FARes.status).toBe(200);
    expect(valid2FARes.body).toHaveProperty('accessToken');
    const newOwnerToken = valid2FARes.body.accessToken;

    // 6. Disable 2FA
    const disableCode = generateTotpToken(secret);
    const disableRes = await request(app)
      .post('/api/auth/2fa/disable')
      .set('Authorization', `Bearer ${newOwnerToken}`)
      .send({ code: disableCode });

    expect(disableRes.status).toBe(200);
    expect(disableRes.body.success).toBe(true);
  });

  it('should authenticate request using httpOnly cookie', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'counter@mess.local',
        password: 'Counter@123456',
      });

    const setCookies = loginRes.get('Set-Cookie') || [];
    const cookieHeader = setCookies.map((c: string) => c.split(';')[0]).join('; ');

    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Cookie', cookieHeader);

    expect(meRes.status).toBe(200);
    expect(meRes.body.user.role).toBe('COUNTER');
  });

  it('should reject state-changing cookie requests without matching CSRF token', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'owner@mess.local',
        password: 'Owner@123456',
      });

    const setCookies = loginRes.get('Set-Cookie') || [];
    const cookieHeader = setCookies.map((c: string) => c.split(';')[0]).join('; ');

    // Send POST with cookies only (no Authorization header and missing x-csrf-token)
    const csrfBlockedRes = await request(app)
      .post('/api/auth/revoke-all-sessions')
      .set('Cookie', cookieHeader);

    expect(csrfBlockedRes.status).toBe(403);
    expect(csrfBlockedRes.body.error.message).toContain('CSRF');

    // Extract XSRF-TOKEN from cookie
    const xsrfCookie = setCookies.find((c: string) => c.startsWith('XSRF-TOKEN='));
    const csrfValue = xsrfCookie ? xsrfCookie.split(';')[0].split('=')[1] : '';

    // Send POST with matching x-csrf-token header -> succeeds!
    const csrfSuccessRes = await request(app)
      .post('/api/auth/revoke-all-sessions')
      .set('Cookie', cookieHeader)
      .set('x-csrf-token', csrfValue);

    expect(csrfSuccessRes.status).toBe(200);
  });
});
