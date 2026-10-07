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
let counterUserId: number;

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
  counterUserId = counterRes.body.user.id;

  const ownerRes = await request(app).post('/api/auth/login').send({
    email: 'owner@mess.local',
    password: 'Owner@123456',
  });
  ownerToken = ownerRes.body.accessToken;
});

// connection managed globally

describe('Counter Screen End-to-End Flow (Approved, Rejected, Manual Fallback)', () => {
  let approvedStudentId: number;
  let manualStudentId: number;
  const devUserId1 = `DEV_FLOW_01_${Date.now()}`;
  const devUserId2 = `DEV_FLOW_02_${Date.now()}`;

  beforeAll(async () => {
    const todayStr = new Date().toISOString().split('T')[0];
    const nextMonthStr = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];

    // Create fresh student 1 for fingerprint scan testing
    const [s1Id] = await db('students').insert({
      student_code: `STU-E2E-1-${Date.now()}`,
      name: 'Aarav E2E Sharma',
      phone: '9876540001',
      status: 'ACTIVE',
      consent_given_at: new Date(),
      created_at: new Date(),
      updated_at: new Date(),
    });
    approvedStudentId = s1Id;

    const [p1Id] = await db('student_plans').insert({
      student_id: approvedStudentId,
      plan_id: 1,
      start_date: todayStr,
      end_date: nextMonthStr,
      tokens_total: 30,
      payment_mode: 'UPI',
      amount_paid_inr: 1800,
      sold_by: 1,
      created_at: new Date(),
    });

    await db('token_ledger').insert({
      student_id: approvedStudentId,
      student_plan_id: p1Id,
      change_amount: 30,
      reason: 'PLAN_PURCHASE',
      method: 'SYSTEM',
      created_by: 1,
      created_at: new Date(),
    });

    await db('fingerprints').insert({
      student_id: approvedStudentId,
      finger_label: 'Right index',
      device_user_id: devUserId1,
      template_encrypted: Buffer.from('mock_encrypted'),
      iv: 'mock_iv',
      auth_tag: 'mock_tag',
      is_active: true,
      enrolled_by: 1,
      enrolled_at: new Date(),
    });

    // Create fresh student 2 for manual fallback testing
    const [s2Id] = await db('students').insert({
      student_code: `STU-E2E-2-${Date.now()}`,
      name: 'Rohan E2E Verma',
      phone: '9876540002',
      status: 'ACTIVE',
      consent_given_at: new Date(),
      created_at: new Date(),
      updated_at: new Date(),
    });
    manualStudentId = s2Id;

    const [p2Id] = await db('student_plans').insert({
      student_id: manualStudentId,
      plan_id: 1,
      start_date: todayStr,
      end_date: nextMonthStr,
      tokens_total: 20,
      payment_mode: 'CASH',
      amount_paid_inr: 1800,
      sold_by: 1,
      created_at: new Date(),
    });

    await db('token_ledger').insert({
      student_id: manualStudentId,
      student_plan_id: p2Id,
      change_amount: 20,
      reason: 'PLAN_PURCHASE',
      method: 'SYSTEM',
      created_by: 1,
      created_at: new Date(),
    });
  });

  it('E2E Flow 1: Should simulate approved scan via MockDevice and deduct token', async () => {
    // Initial balance
    const [initialBalanceRow] = await db('student_balances').where('student_id', approvedStudentId);
    const initialBalance = Number(initialBalanceRow?.balance || 0);
    expect(initialBalance).toBe(30);

    // Simulate scan on deviceUserId
    const scanRes = await postScan({
      deviceUserId: devUserId1,
      deviceId: 'DEV-COUNTER-01',
      simulatedWindowId: 1, // Lunch window
    });

    expect(scanRes.status).toBe(200);
    expect(scanRes.body.result).toBe('APPROVED');
    expect(scanRes.body.student).toBeDefined();
    expect(scanRes.body.student.name).toBe('Aarav E2E Sharma');
    if (scanRes.body.mealWindow) {
      expect(scanRes.body.mealWindow.name).toBe('Lunch');
    }

    // Verify append-only meal_log entry
    const mealLog = await db('meal_log').where('id', scanRes.body.mealLogId).first();
    expect(mealLog).toBeDefined();
    expect(mealLog.result).toBe('APPROVED');
    expect(mealLog.method).toBe('FINGERPRINT');
    expect(mealLog.student_id).toBe(approvedStudentId);

    // Verify append-only token_ledger entry
    const ledgerEntry = await db('token_ledger')
      .where('student_id', approvedStudentId)
      .orderBy('id', 'desc')
      .first();
    expect(ledgerEntry).toBeDefined();
    expect(ledgerEntry.change_amount).toBe(-1);
    expect(ledgerEntry.reason).toBe('MEAL');
    expect(ledgerEntry.method).toBe('FINGERPRINT');
  });

  it('E2E Flow 2: Should reject scan on immediate repeat scan (ALREADY_ATE)', async () => {
    // Same student scans again within the same window
    const repeatRes = await postScan({
      deviceUserId: devUserId1,
      deviceId: 'DEV-COUNTER-01',
      simulatedWindowId: 1,
    });

    expect(repeatRes.status).toBe(200);
    expect(repeatRes.body.result).toBe('REJECTED');
    expect(repeatRes.body.rejectReason).toBe('ALREADY_ATE');
    expect(repeatRes.body.student.name).toBe('Aarav E2E Sharma');
  });

  it('E2E Flow 3: Should reject scan for inactive student (INACTIVE_STUDENT)', async () => {
    // Student 30 is seeded as INACTIVE
    const inactiveStudent = await db('students').where('status', 'INACTIVE').first();
    expect(inactiveStudent).toBeDefined();

    const inactiveRes = await postScan({
      studentId: inactiveStudent.id,
      simulatedWindowId: 1,
    });

    expect(inactiveRes.status).toBe(200);
    expect(inactiveRes.body.result).toBe('REJECTED');
    expect(inactiveRes.body.rejectReason).toBe('INACTIVE_STUDENT');
  });

  it('E2E Flow 4: Should reject scan for unregistered device user ID (NO_MATCH)', async () => {
    const unknownRes = await postScan({
      deviceUserId: 'UNKNOWN_FINGER_9999',
      deviceId: 'DEV-COUNTER-01',
      simulatedWindowId: 1,
    });

    expect(unknownRes.status).toBe(200);
    expect(unknownRes.body.result).toBe('REJECTED');
    expect(unknownRes.body.rejectReason).toBe('NO_MATCH');
  });

  it('E2E Flow 5: Manual meal marking requires a mandatory reason', async () => {
    const invalidRes = await request(app)
      .post('/api/meals/manual')
      .set('Authorization', `Bearer ${counterToken}`)
      .send({
        studentId: manualStudentId,
        // manualReason omitted intentionally
        simulatedWindowId: 1,
      });

    expect(invalidRes.status).toBe(400);
    expect(invalidRes.body.error).toBeDefined();
  });

  it('E2E Flow 6: Should successfully mark manual meal with valid reason and audit log', async () => {
    const [balRow] = await db('student_balances').where('student_id', manualStudentId);
    const prevBalance = Number(balRow?.balance || 0);
    expect(prevBalance).toBe(20);

    const manualRes = await request(app)
      .post('/api/meals/manual')
      .set('Authorization', `Bearer ${counterToken}`)
      .send({
        studentId: manualStudentId,
        manualReason: 'WET_OR_OILY_FINGER',
        note: 'Student washed hands immediately before meal line; scanner smudged',
        simulatedWindowId: 1,
      });

    expect(manualRes.status).toBe(200);
    expect(manualRes.body.result).toBe('APPROVED');
    expect(manualRes.body.method).toBe('MANUAL');
    expect(manualRes.body.student.name).toBe('Rohan E2E Verma');
    expect(manualRes.body.student.tokensLeft).toBe(19);

    // Verify meal_log record
    const mealRecord = await db('meal_log').where('id', manualRes.body.mealLogId).first();
    expect(mealRecord).toBeDefined();
    expect(mealRecord.method).toBe('MANUAL');
    expect(mealRecord.manual_reason).toBe('WET_OR_OILY_FINGER');
    expect(mealRecord.marked_by).toBe(counterUserId);

    // Verify token_ledger record
    const ledgerRecord = await db('token_ledger')
      .where('student_id', manualStudentId)
      .orderBy('id', 'desc')
      .first();
    expect(ledgerRecord).toBeDefined();
    expect(ledgerRecord.change_amount).toBe(-1);
    expect(ledgerRecord.method).toBe('MANUAL');
    expect(ledgerRecord.created_by).toBe(counterUserId);

    // Verify audit_log entry
    const audit = await db('audit_log')
      .where('target_id', manualStudentId)
      .andWhere('action', 'MANUAL_MEAL_MARKED')
      .orderBy('id', 'desc')
      .first();
    expect(audit).toBeDefined();
    expect(audit.admin_id).toBe(counterUserId);
    expect(JSON.stringify(audit.detail)).toMatch(/WET_OR_OILY_FINGER/);
  });
});
