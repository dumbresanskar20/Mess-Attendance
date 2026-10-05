import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { db } from '../db/connection';

const app = createApp();

let ownerToken: string;
let counterToken: string;

beforeAll(async () => {
  const ownerRes = await request(app).post('/api/auth/login').send({
    email: 'owner@mess.local',
    password: 'Owner@123456',
  });
  ownerToken = ownerRes.body.accessToken;

  const counterRes = await request(app).post('/api/auth/login').send({
    email: 'counter@mess.local',
    password: 'Counter@123456',
  });
  counterToken = counterRes.body.accessToken;
});

afterAll(async () => {
  await db.destroy();
});

describe('Phase 2: Core Data (Students, Plans, Ledger, Audit, Staff)', () => {
  let createdStudentId: number;

  it('should list students with pagination and balance computation', async () => {
    const res = await request(app)
      .get('/api/students?limit=5')
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(5);
    expect(res.body.pagination.total).toBeGreaterThanOrEqual(30);
    expect(res.body.data[0]).toHaveProperty('tokens_left');
    expect(res.body.data[0]).toHaveProperty('finger_count');
  });

  it('should create a new student and record an audit log', async () => {
    const studentCode = `STU-TEST-${Date.now()}`;
    const res = await request(app)
      .post('/api/students')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        student_code: studentCode,
        name: 'Test Student',
        phone: '9988776655',
        consent_given: true,
      });

    expect(res.status).toBe(201);
    expect(res.body.student_code).toBe(studentCode);
    expect(res.body.status).toBe('ACTIVE');
    createdStudentId = res.body.id;

    // Check audit log
    const audit = await db('audit_log')
      .where({ action: 'STUDENT_CREATE', target_id: String(createdStudentId) })
      .first();
    expect(audit).toBeDefined();
  });

  it('should sell a plan to the new student and increment tokens in ledger and balance', async () => {
    const res = await request(app)
      .post(`/api/students/${createdStudentId}/plans`)
      .set('Authorization', `Bearer ${counterToken}`)
      .send({
        planId: 1, // Starter 30 tokens
        paymentMode: 'UPI',
        startDate: '2026-10-01',
      });

    expect(res.status).toBe(201);
    expect(res.body.tokensAdded).toBe(30);
    expect(res.body.currentBalance).toBe(30);

    // Verify ledger entry
    const ledger = await db('token_ledger')
      .where({ student_id: createdStudentId, reason: 'PLAN_PURCHASE' })
      .first();
    expect(ledger).toBeDefined();
    expect(ledger.change_amount).toBe(30);
  });

  it('should prevent COUNTER role from manually adjusting tokens', async () => {
    const res = await request(app)
      .post('/api/tokens/adjust')
      .set('Authorization', `Bearer ${counterToken}`)
      .send({
        studentId: createdStudentId,
        amount: 5,
        reason: 'Staff gift',
      });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('should allow OWNER role to manually adjust tokens with a reason', async () => {
    const res = await request(app)
      .post('/api/tokens/adjust')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        studentId: createdStudentId,
        amount: 5,
        reason: 'Bonus tokens for good attendance',
      });

    expect(res.status).toBe(200);
    expect(res.body.previousBalance).toBe(30);
    expect(res.body.newBalance).toBe(35);

    // Check ledger entry
    const ledger = await db('token_ledger')
      .where({ student_id: createdStudentId, reason: 'MANUAL_ADJUST' })
      .first();
    expect(ledger).toBeDefined();
    expect(ledger.change_amount).toBe(5);
  });

  it('should fetch the student ledger with details', async () => {
    const res = await request(app)
      .get(`/api/students/${createdStudentId}/ledger`)
      .set('Authorization', `Bearer ${counterToken}`);

    expect(res.status).toBe(200);
    expect(res.body.currentBalance).toBe(35);
    expect(res.body.data.length).toBeGreaterThanOrEqual(2); // Plan purchase + adjust
  });

  it('should reject token adjustment that would make balance negative', async () => {
    const res = await request(app)
      .post('/api/tokens/adjust')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        studentId: createdStudentId,
        amount: -100,
        reason: 'Over-deduction attempt',
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INSUFFICIENT_BALANCE');
  });

  it('should prevent COUNTER role from viewing staff accounts and audit log', async () => {
    const staffRes = await request(app)
      .get('/api/staff')
      .set('Authorization', `Bearer ${counterToken}`);
    expect(staffRes.status).toBe(403);

    const auditRes = await request(app)
      .get('/api/audit')
      .set('Authorization', `Bearer ${counterToken}`);
    expect(auditRes.status).toBe(403);
  });

  it('should allow OWNER to list staff and audit logs', async () => {
    const staffRes = await request(app)
      .get('/api/staff')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(staffRes.status).toBe(200);
    expect(staffRes.body.length).toBeGreaterThanOrEqual(2);

    const auditRes = await request(app)
      .get('/api/audit')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(auditRes.status).toBe(200);
    expect(auditRes.body.data.length).toBeGreaterThanOrEqual(1);
  });

  it('should deactivate student and their fingerprints', async () => {
    const res = await request(app)
      .post(`/api/students/${createdStudentId}/deactivate`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.student.status).toBe('INACTIVE');
  });
});
