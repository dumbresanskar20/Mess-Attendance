import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { db } from '../db/connection';

const app = createApp();

describe('Auth API & Role-Based Access Control', () => {
  afterAll(async () => {
    await db.destroy();
  });

  it('should authenticate OWNER with valid credentials', async () => {
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

  it('should reject invalid credentials with 401 UNAUTHORIZED', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'owner@mess.local',
        password: 'IncorrectPassword',
      });

    expect(res.status).toBe(401);
    expect(res.body.error).toHaveProperty('code', 'UNAUTHORIZED');
  });

  it('should refresh access token using valid refresh token', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'owner@mess.local',
        password: 'Owner@123456',
      });

    const refreshToken = loginRes.body.refreshToken;

    const refreshRes = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken });

    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body).toHaveProperty('accessToken');
    expect(refreshRes.body).toHaveProperty('refreshToken');
    expect(refreshRes.body.user.email).toBe('owner@mess.local');
  });

  it('should return current user for /api/auth/me when token is valid', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'counter@mess.local',
        password: 'Counter@123456',
      });

    const token = loginRes.body.accessToken;

    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(meRes.status).toBe(200);
    expect(meRes.body.user.role).toBe('COUNTER');
  });

  it('should reject /api/auth/me when token is absent or invalid', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });
});
