import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { db } from '../db/connection';

const app = createApp();

let ownerToken: string;
let counterToken: string;
let consentedStudentId: number;
let unconsentedStudentId: number;

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

  // Create student with consent
  const [cId] = await db('students').insert({
    student_code: `STU-CONSENT-${Date.now()}`,
    name: 'Consented Student',
    phone: '9876543210',
    status: 'ACTIVE',
    consent_given_at: new Date(),
    created_at: new Date(),
    updated_at: new Date(),
  });
  consentedStudentId = cId;

  // Create student without consent
  const [uId] = await db('students').insert({
    student_code: `STU-NOCONSENT-${Date.now()}`,
    name: 'No Consent Student',
    phone: '9876543211',
    status: 'ACTIVE',
    consent_given_at: null,
    created_at: new Date(),
    updated_at: new Date(),
  });
  unconsentedStudentId = uId;
});

// connection managed globally

describe('Phase 4: Device Layer & Fingerprint Management', () => {
  let enrolledFingerId: number;

  it('should NEVER expose raw or encrypted fingerprint templates in API responses', async () => {
    const res = await request(app)
      .get(`/api/students/1/fingerprints`)
      .set('Authorization', `Bearer ${counterToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);

    for (const finger of res.body.data) {
      expect(finger).not.toHaveProperty('template_encrypted');
      expect(finger).not.toHaveProperty('iv');
      expect(finger).not.toHaveProperty('auth_tag');
      expect(finger).not.toHaveProperty('raw_template');
      expect(finger).toHaveProperty('finger_label');
      expect(finger).toHaveProperty('is_active');
    }
  });

  it('should reject enrollment if student consent is missing', async () => {
    const res = await request(app)
      .post(`/api/students/${unconsentedStudentId}/fingerprints/enroll`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        finger_label: 'Right index',
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('CONSENT_REQUIRED');
  });

  it('should enroll a finger for a consented student and encrypt the template with AES-256-GCM', async () => {
    const res = await request(app)
      .post(`/api/students/${consentedStudentId}/fingerprints/enroll`)
      .set('Authorization', `Bearer ${counterToken}`)
      .send({
        finger_label: 'Right index',
        raw_template: 'TEST_BIOMETRIC_DATA_RAW_XYZ',
      });

    expect(res.status).toBe(201);
    expect(res.body.finger_label).toBe('Right index');
    expect(res.body).not.toHaveProperty('template_encrypted');
    enrolledFingerId = res.body.id;

    // Verify database record has ciphertext, iv, and auth tag
    const dbRow = await db('fingerprints').where('id', enrolledFingerId).first();
    expect(dbRow).toBeDefined();
    expect(dbRow.template_encrypted).toBeDefined();
    expect(dbRow.iv).toHaveLength(24); // 12 bytes = 24 hex
    expect(dbRow.auth_tag).toHaveLength(32); // 16 bytes = 32 hex
  });

  it('should deactivate a fingerprint', async () => {
    const res = await request(app)
      .post(`/api/fingerprints/${enrolledFingerId}/deactivate`)
      .set('Authorization', `Bearer ${counterToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const dbRow = await db('fingerprints').where('id', enrolledFingerId).first();
    expect(dbRow.is_active).toBe(0); // false in MySQL
  });

  it('should prevent COUNTER role from purging biometric data', async () => {
    const res = await request(app)
      .post(`/api/fingerprints/${enrolledFingerId}/purge`)
      .set('Authorization', `Bearer ${counterToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('should allow OWNER to permanently purge biometric template and write an audit log', async () => {
    const res = await request(app)
      .post(`/api/fingerprints/${enrolledFingerId}/purge`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Verify template was erased in DB
    const dbRow = await db('fingerprints').where('id', enrolledFingerId).first();
    expect(dbRow.iv).toBe('PURGED');
    expect(dbRow.auth_tag).toBe('PURGED');
    expect(dbRow.purged_at).not.toBeNull();

    // Verify audit log
    const audit = await db('audit_log')
      .where({ action: 'FINGERPRINT_PURGE', target_id: String(enrolledFingerId) })
      .first();
    expect(audit).toBeDefined();
  });

  it('should return device status', async () => {
    const res = await request(app)
      .get('/api/device/status')
      .set('Authorization', `Bearer ${counterToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('connected');
  });
});
