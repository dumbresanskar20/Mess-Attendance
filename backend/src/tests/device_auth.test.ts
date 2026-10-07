import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { db } from '../db/connection';
import { calculateDeviceSignature } from '../utils/deviceSignature';

const app = createApp();

const TEST_DEVICE_ID = 'DEV-COUNTER-01';
const TEST_DEVICE_SECRET = 'mock-device-secret-key-2026';

let studentWithTokensId: number;
let staffToken: string;

function createSignedHeaders(
  body: any,
  options?: {
    deviceId?: string;
    secret?: string;
    timestamp?: string | number;
    signature?: string;
  }
) {
  const deviceId = options?.deviceId ?? TEST_DEVICE_ID;
  const secret = options?.secret ?? TEST_DEVICE_SECRET;
  const timestamp = options?.timestamp ?? new Date().toISOString();
  const signature = options?.signature ?? calculateDeviceSignature(secret, timestamp, body);

  return {
    'X-Device-Id': deviceId,
    'X-Timestamp': String(timestamp),
    'X-Signature': signature,
  };
}

beforeAll(async () => {
  // Ensure devices table exists and has our test device
  const hasDevices = await db.schema.hasTable('devices');
  if (!hasDevices) {
    await db.schema.createTable('devices', (table) => {
      table.bigIncrements('id').primary();
      table.string('device_id', 100).notNullable().unique();
      table.string('name', 255).notNullable();
      table.string('secret_hash', 255).notNullable();
      table.boolean('is_active').notNullable().defaultTo(true);
      table.dateTime('last_heartbeat_at', { precision: 3 }).nullable();
      table.dateTime('created_at', { precision: 3 }).notNullable().defaultTo(db.fn.now(3));
      table.dateTime('updated_at', { precision: 3 }).notNullable().defaultTo(db.fn.now(3));
    });
  }

  // Ensure test device is present
  const existingDevice = await db('devices').where('device_id', TEST_DEVICE_ID).first();
  if (!existingDevice) {
    await db('devices').insert({
      device_id: TEST_DEVICE_ID,
      name: 'Counter 1 Scanner Bridge',
      secret_hash: TEST_DEVICE_SECRET,
      is_active: true,
      last_heartbeat_at: new Date(),
      created_at: new Date(),
      updated_at: new Date(),
    });
  } else {
    await db('devices').where('device_id', TEST_DEVICE_ID).update({
      secret_hash: TEST_DEVICE_SECRET,
      is_active: true,
    });
  }

  // Obtain staff JWT for testing route isolation
  const loginRes = await request(app).post('/api/auth/login').send({
    email: 'counter@mess.local',
    password: 'Counter@123456',
  });
  staffToken = loginRes.body.accessToken;

  // Create active student with tokens for testing scan & idempotency
  const [stuId] = await db('students').insert({
    student_code: `STU-SEC-${Date.now()}`,
    name: 'Security Test Student',
    phone: '9888877771',
    status: 'ACTIVE',
    created_at: new Date(),
    updated_at: new Date(),
  });
  studentWithTokensId = stuId;

  const todayStr = new Date().toISOString().split('T')[0];
  const nextMonthStr = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];

  const [planId] = await db('student_plans').insert({
    student_id: studentWithTokensId,
    plan_id: 1,
    start_date: todayStr,
    end_date: nextMonthStr,
    tokens_total: 20,
    payment_mode: 'UPI',
    amount_paid_inr: 1800,
    sold_by: 1,
    created_at: new Date(),
  });

  await db('token_ledger').insert({
    student_id: studentWithTokensId,
    student_plan_id: planId,
    change_amount: 20,
    reason: 'PLAN_PURCHASE',
    method: 'SYSTEM',
    created_by: 1,
    created_at: new Date(),
  });
});

// connection managed globally

describe('Device Credential & HMAC Signature Security Suite', () => {
  it('1. Valid signature: should accept scan request with correct HMAC-SHA256 headers', async () => {
    const payload = {
      studentId: studentWithTokensId,
      simulatedWindowId: 1,
      event_id: `EVT_VALID_${Date.now()}`,
    };

    const headers = createSignedHeaders(payload);

    const res = await request(app)
      .post('/api/scan')
      .set(headers)
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body.result).toBe('APPROVED');
    expect(res.body.student.tokensLeft).toBe(19);
  });

  it('2. Bad signature: should reject scan when signature does not match secret or payload', async () => {
    const payload = {
      studentId: studentWithTokensId,
      simulatedWindowId: 1,
    };

    // Sign with wrong secret
    const badHeaders = createSignedHeaders(payload, { secret: 'wrong-device-secret-999' });

    const res = await request(app)
      .post('/api/scan')
      .set(badHeaders)
      .send(payload);

    expect(res.status).toBe(401);
    expect(res.body.error.message).toMatch(/Invalid device signature/i);
  });

  it('2b. Bad signature: should reject scan when payload body was tampered after signing', async () => {
    const originalPayload = {
      studentId: studentWithTokensId,
      simulatedWindowId: 1,
    };
    const headers = createSignedHeaders(originalPayload);

    // Tampered payload
    const tamperedPayload = {
      studentId: studentWithTokensId,
      simulatedWindowId: 2, // Changed window ID
    };

    const res = await request(app)
      .post('/api/scan')
      .set(headers)
      .send(tamperedPayload);

    expect(res.status).toBe(401);
    expect(res.body.error.message).toMatch(/Invalid device signature/i);
  });

  it('3. Expired timestamp: should reject requests older than 60 seconds (replay protection)', async () => {
    const payload = {
      studentId: studentWithTokensId,
      simulatedWindowId: 1,
    };

    // 65 seconds in the past
    const expiredTimestamp = new Date(Date.now() - 65 * 1000).toISOString();
    const expiredHeaders = createSignedHeaders(payload, { timestamp: expiredTimestamp });

    const res = await request(app)
      .post('/api/scan')
      .set(expiredHeaders)
      .send(payload);

    expect(res.status).toBe(401);
    expect(res.body.error.message).toMatch(/expired or outside the 60-second validity window/i);
  });

  it('3b. Future timestamp drift: should reject requests with timestamp > 60 seconds in the future', async () => {
    const payload = {
      studentId: studentWithTokensId,
      simulatedWindowId: 1,
    };

    // 70 seconds in the future
    const futureTimestamp = new Date(Date.now() + 70 * 1000).toISOString();
    const futureHeaders = createSignedHeaders(payload, { timestamp: futureTimestamp });

    const res = await request(app)
      .post('/api/scan')
      .set(futureHeaders)
      .send(payload);

    expect(res.status).toBe(401);
    expect(res.body.error.message).toMatch(/expired or outside the 60-second validity window/i);
  });

  it('4. Replayed event_id: multiple scan requests with the same event_id must be idempotent and deduct only once', async () => {
    // Create dedicated student with 10 tokens
    const [freshStudentId] = await db('students').insert({
      student_code: `STU-IDEM-${Date.now()}`,
      name: 'Idempotency Test Student',
      phone: '9888877772',
      status: 'ACTIVE',
      created_at: new Date(),
      updated_at: new Date(),
    });

    const todayStr = new Date().toISOString().split('T')[0];
    const nextMonthStr = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];

    const [planId] = await db('student_plans').insert({
      student_id: freshStudentId,
      plan_id: 1,
      start_date: todayStr,
      end_date: nextMonthStr,
      tokens_total: 10,
      payment_mode: 'UPI',
      amount_paid_inr: 1800,
      sold_by: 1,
      created_at: new Date(),
    });

    await db('token_ledger').insert({
      student_id: freshStudentId,
      student_plan_id: planId,
      change_amount: 10,
      reason: 'PLAN_PURCHASE',
      method: 'SYSTEM',
      created_by: 1,
      created_at: new Date(),
    });

    const uniqueEventId = `EVENT_ID_IDEMPOTENT_${Date.now()}`;
    const payload = {
      studentId: freshStudentId,
      simulatedWindowId: 1,
      event_id: uniqueEventId,
    };

    // Record starting balance (10 tokens)
    const [startBal] = await db('student_balances').where('student_id', freshStudentId);
    expect(Number(startBal.balance)).toBe(10);

    // Request 1: Initial scan
    const headers1 = createSignedHeaders(payload);
    const res1 = await request(app)
      .post('/api/scan')
      .set(headers1)
      .send(payload);

    expect(res1.status).toBe(200);
    expect(res1.body.result).toBe('APPROVED');
    expect(res1.body.student.tokensLeft).toBe(9);
    const firstMealLogId = res1.body.mealLogId;

    // Verify exactly 1 token deducted
    const [midBal] = await db('student_balances').where('student_id', freshStudentId);
    expect(Number(midBal.balance)).toBe(9);

    // Request 2: Replay of same event_id (e.g. network retry from bridge)
    const headers2 = createSignedHeaders(payload);
    const res2 = await request(app)
      .post('/api/scan')
      .set(headers2)
      .send(payload);

    expect(res2.status).toBe(200);
    expect(res2.body.result).toBe('APPROVED');
    expect(res2.body.mealLogId).toBe(firstMealLogId);

    // Balance MUST NOT be deducted a second time!
    const [finalBal] = await db('student_balances').where('student_id', freshStudentId);
    expect(Number(finalBal.balance)).toBe(9);

    // Check database has only one meal_log row for this event_id
    const eventRows = await db('meal_log').where('event_id', uniqueEventId);
    expect(eventRows).toHaveLength(1);
  });

  it('5. Route isolation: POST /api/scan should be unusable with only staff JWT', async () => {
    const payload = {
      studentId: studentWithTokensId,
      simulatedWindowId: 1,
    };

    const res = await request(app)
      .post('/api/scan')
      .set('Authorization', `Bearer ${staffToken}`)
      .send(payload);

    expect(res.status).toBe(401);
    expect(res.body.error.message).toMatch(/Device credentials required/i);
  });

  it('6. Route isolation: Staff routes should be unusable with only a device signature', async () => {
    const headers = createSignedHeaders({ studentId: studentWithTokensId });

    const res = await request(app)
      .get('/api/students')
      .set(headers);

    expect(res.status).toBe(401);
    expect(res.body.error.message).toMatch(/Missing or malformed Authorization header/i);
  });

  it('7. Device heartbeat: bridge pings /api/devices/heartbeat every 30s and updates last_heartbeat_at', async () => {
    const heartbeatPayload = { driver: 'mock', status: 'ONLINE' };
    const headers = createSignedHeaders(heartbeatPayload);

    const res = await request(app)
      .post('/api/devices/heartbeat')
      .set(headers)
      .send(heartbeatPayload);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.deviceId).toBe(TEST_DEVICE_ID);

    // Check devices table has updated timestamp
    const dev = await db('devices').where('device_id', TEST_DEVICE_ID).first();
    expect(dev.last_heartbeat_at).not.toBeNull();

    // Check GET /api/devices/status returns connected: true
    const statusRes = await request(app).get('/api/devices/status');
    expect(statusRes.status).toBe(200);
    expect(statusRes.body.connected).toBe(true);
  });
});
