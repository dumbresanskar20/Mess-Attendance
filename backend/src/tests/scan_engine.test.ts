import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { db } from '../db/connection';
import { calculateDeviceSignature } from '../utils/deviceSignature';

const app = createApp();

const DEVICE_ID = 'DEV-COUNTER-01';
const DEVICE_SECRET = 'mock-device-secret-key-2026';

let counterToken: string;
let ownerToken: string;

function postScan(payload: any) {
  const timestamp = new Date().toISOString();
  const signature = calculateDeviceSignature(DEVICE_SECRET, timestamp, payload);
  return request(app)
    .post('/api/scan')
    .set({
      'X-Device-Id': DEVICE_ID,
      'X-Timestamp': timestamp,
      'X-Signature': signature,
    })
    .send(payload);
}

beforeAll(async () => {
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

  const existingDevice = await db('devices').where('device_id', DEVICE_ID).first();
  if (!existingDevice) {
    await db('devices').insert({
      device_id: DEVICE_ID,
      name: 'Counter 1 Scanner Bridge',
      secret_hash: DEVICE_SECRET,
      is_active: true,
      last_heartbeat_at: new Date(),
      created_at: new Date(),
      updated_at: new Date(),
    });
  }

  const counterRes = await request(app).post('/api/auth/login').send({
    email: 'counter@mess.local',
    password: 'Counter@123456',
  });
  counterToken = counterRes.body.accessToken;

  const ownerRes = await request(app).post('/api/auth/login').send({
    email: 'owner@mess.local',
    password: 'Owner@123456',
  });
  ownerToken = ownerRes.body.accessToken;
});

// connection managed globally

describe('Phase 3: Scan Engine & Meal Rules', () => {
  it('should reject scan when no student matches (NO_MATCH)', async () => {
    const res = await postScan({
      deviceUserId: 'NON_EXISTENT_DEVICE_USER_9999',
      simulatedWindowId: 1,
    });

    expect(res.status).toBe(200);
    expect(res.body.result).toBe('REJECTED');
    expect(res.body.rejectReason).toBe('NO_MATCH');

    // Verify meal_log row was written even for rejection
    const log = await db('meal_log').where('id', res.body.mealLogId).first();
    expect(log).toBeDefined();
    expect(log.result).toBe('REJECTED');
    expect(log.reject_reason).toBe('NO_MATCH');
  });

  it('should reject scan if student is inactive (INACTIVE_STUDENT)', async () => {
    // Find inactive student (Student 30 was seeded as INACTIVE)
    const inactiveStudent = await db('students').where('status', 'INACTIVE').first();
    expect(inactiveStudent).toBeDefined();

    const res = await postScan({
      studentId: inactiveStudent.id,
      simulatedWindowId: 1,
    });

    expect(res.status).toBe(200);
    expect(res.body.result).toBe('REJECTED');
    expect(res.body.rejectReason).toBe('INACTIVE_STUDENT');
  });

  it('should reject scan if counter is outside active meal window (OUTSIDE_WINDOW)', async () => {
    // Student 5 is active with active plan
    const student = await db('students').where('id', 5).first();

    const res = await postScan({
      studentId: student.id,
      simulatedWindowId: 9999, // Outside window
    });

    expect(res.status).toBe(200);
    expect(res.body.result).toBe('REJECTED');
    expect(res.body.rejectReason).toBe('OUTSIDE_WINDOW');
  });

  it('should reject scan if plan is expired (PLAN_EXPIRED)', async () => {
    // Student 29 was seeded with an expired plan (expired 5 days ago)
    const student = await db('students').where('id', 29).first();

    const res = await postScan({
      studentId: student.id,
      simulatedWindowId: 1,
    });

    expect(res.status).toBe(200);
    expect(res.body.result).toBe('REJECTED');
    expect(res.body.rejectReason).toBe('PLAN_EXPIRED');
  });

  it('should reject scan if student balance is zero (NO_BALANCE)', async () => {
    // Create a temporary student with an active plan but 0 tokens
    const studentCode = `STU-ZERO-BAL-${Date.now()}`;
    const [studentId] = await db('students').insert({
      student_code: studentCode,
      name: 'Zero Balance Student',
      phone: '9988001122',
      status: 'ACTIVE',
      created_at: new Date(),
      updated_at: new Date(),
    });

    const todayStr = new Date().toISOString().split('T')[0];
    const nextMonthStr = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];

    const [planId] = await db('student_plans').insert({
      student_id: studentId,
      plan_id: 1,
      start_date: todayStr,
      end_date: nextMonthStr,
      tokens_total: 10,
      payment_mode: 'CASH',
      amount_paid_inr: 1800,
      sold_by: 1,
      created_at: new Date(),
    });

    // Note: No tokens added in ledger, so balance is 0!
    const res = await postScan({
      studentId,
      simulatedWindowId: 1,
    });

    expect(res.status).toBe(200);
    expect(res.body.result).toBe('REJECTED');
    expect(res.body.rejectReason).toBe('NO_BALANCE');
  });

  it('should approve valid scan, deduct exactly 1 token in ledger, and write meal_log row', async () => {
    // Create a fresh active student with 10 tokens
    const studentCode = `STU-APP-${Date.now()}`;
    const [studentId] = await db('students').insert({
      student_code: studentCode,
      name: 'Approved Student',
      phone: '9988112233',
      status: 'ACTIVE',
      created_at: new Date(),
      updated_at: new Date(),
    });

    const todayStr = new Date().toISOString().split('T')[0];
    const nextMonthStr = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];

    const [planId] = await db('student_plans').insert({
      student_id: studentId,
      plan_id: 2,
      start_date: todayStr,
      end_date: nextMonthStr,
      tokens_total: 10,
      payment_mode: 'UPI',
      amount_paid_inr: 3300,
      sold_by: 1,
      created_at: new Date(),
    });

    await db('token_ledger').insert({
      student_id: studentId,
      student_plan_id: planId,
      change_amount: 10,
      reason: 'PLAN_PURCHASE',
      method: 'SYSTEM',
      created_by: 1,
      created_at: new Date(),
    });

    // Check initial balance
    const [initialBal] = await db('student_balances').where('student_id', studentId);
    expect(Number(initialBal.balance)).toBe(10);

    // Perform scan
    const res = await postScan({
      studentId,
      simulatedWindowId: 1,
    });

    expect(res.status).toBe(200);
    expect(res.body.result).toBe('APPROVED');
    expect(res.body.student.tokensLeft).toBe(9);

    // Verify token_ledger deduction
    const deduction = await db('token_ledger')
      .where({
        student_id: studentId,
        reason: 'MEAL',
        change_amount: -1,
      })
      .first();
    expect(deduction).toBeDefined();

    // Verify updated balance in view
    const [updatedBal] = await db('student_balances').where('student_id', studentId);
    expect(Number(updatedBal.balance)).toBe(9);

    // Step 5 test: Immediate second scan must reject with ALREADY_ATE
    const repeatRes = await postScan({
      studentId,
      simulatedWindowId: 1,
    });

    expect(repeatRes.status).toBe(200);
    expect(repeatRes.body.result).toBe('REJECTED');
    expect(repeatRes.body.rejectReason).toBe('ALREADY_ATE');

    // Balance should still be 9 (no double deduction)
    const [balAfterRepeat] = await db('student_balances').where('student_id', studentId);
    expect(Number(balAfterRepeat.balance)).toBe(9);
  });

  it('should support manual meal marking with mandatory reason and method MANUAL', async () => {
    // Create student with 5 tokens
    const studentCode = `STU-MANUAL-${Date.now()}`;
    const [studentId] = await db('students').insert({
      student_code: studentCode,
      name: 'Manual Test Student',
      phone: '9988223344',
      status: 'ACTIVE',
      created_at: new Date(),
      updated_at: new Date(),
    });

    const todayStr = new Date().toISOString().split('T')[0];
    const nextMonthStr = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];

    const [planId] = await db('student_plans').insert({
      student_id: studentId,
      plan_id: 1,
      start_date: todayStr,
      end_date: nextMonthStr,
      tokens_total: 5,
      payment_mode: 'CASH',
      amount_paid_inr: 1800,
      sold_by: 1,
      created_at: new Date(),
    });

    await db('token_ledger').insert({
      student_id: studentId,
      student_plan_id: planId,
      change_amount: 5,
      reason: 'PLAN_PURCHASE',
      method: 'SYSTEM',
      created_by: 1,
      created_at: new Date(),
    });

    // Mark manual meal
    const res = await request(app)
      .post('/api/meals/manual')
      .set('Authorization', `Bearer ${counterToken}`)
      .send({
        studentId,
        manualReason: 'WET_OR_OILY_FINGER',
        note: 'Hands wet from rain',
        simulatedWindowId: 1,
      });

    expect(res.status).toBe(200);
    expect(res.body.result).toBe('APPROVED');
    expect(res.body.method).toBe('MANUAL');
    expect(res.body.student.tokensLeft).toBe(4);

    // Verify meal_log record
    const meal = await db('meal_log').where('id', res.body.mealLogId).first();
    expect(meal.method).toBe('MANUAL');
    expect(meal.manual_reason).toBe('WET_OR_OILY_FINGER');

    // Verify audit log
    const audit = await db('audit_log')
      .where({ action: 'MANUAL_MEAL_MARKED', target_id: String(studentId) })
      .first();
    expect(audit).toBeDefined();
  });

  it('should handle two simultaneous scan requests gracefully with exactly one approval', async () => {
    // Create student with 10 tokens
    const studentCode = `STU-CONCUR-${Date.now()}`;
    const [studentId] = await db('students').insert({
      student_code: studentCode,
      name: 'Concurrent Scan Student',
      phone: '9988334455',
      status: 'ACTIVE',
      created_at: new Date(),
      updated_at: new Date(),
    });

    const todayStr = new Date().toISOString().split('T')[0];
    const nextMonthStr = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];

    const [planId] = await db('student_plans').insert({
      student_id: studentId,
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
      student_id: studentId,
      student_plan_id: planId,
      change_amount: 10,
      reason: 'PLAN_PURCHASE',
      method: 'SYSTEM',
      created_by: 1,
      created_at: new Date(),
    });

    // Fire 2 simultaneous requests
    const [res1, res2] = await Promise.all([
      postScan({ studentId, simulatedWindowId: 1 }),
      postScan({ studentId, simulatedWindowId: 1 }),
    ]);

    const results = [res1.body.result, res2.body.result];
    expect(results).toContain('APPROVED');
    expect(results).toContain('REJECTED');

    // Exactly one deduction
    const deductions = await db('token_ledger')
      .where({ student_id: studentId, reason: 'MEAL' });
    expect(deductions).toHaveLength(1);

    const [finalBal] = await db('student_balances').where('student_id', studentId);
    expect(Number(finalBal.balance)).toBe(9);
  });
});
