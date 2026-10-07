import { describe, it, expect, afterAll } from 'vitest';
import { db } from '../db/connection';

describe('Database Triggers & Append-Only Invariants', () => {

  it('should prohibit UPDATE on token_ledger with trigger error', async () => {
    const entry = await db('token_ledger').first();
    expect(entry).toBeDefined();

    await expect(
      db('token_ledger')
        .where('id', entry.id)
        .update({ change_amount: 999 })
    ).rejects.toThrow(/token_ledger is append-only: UPDATE is prohibited/);
  });

  it('should prohibit DELETE on token_ledger with trigger error', async () => {
    const entry = await db('token_ledger').first();
    expect(entry).toBeDefined();

    await expect(
      db('token_ledger')
        .where('id', entry.id)
        .delete()
    ).rejects.toThrow(/token_ledger is append-only: DELETE is prohibited/);
  });

  it('should prohibit UPDATE on meal_log with trigger error', async () => {
    const log = await db('meal_log').first();
    expect(log).toBeDefined();

    await expect(
      db('meal_log')
        .where('id', log.id)
        .update({ result: 'REJECTED' })
    ).rejects.toThrow(/meal_log is append-only: UPDATE is prohibited/);
  });

  it('should prohibit DELETE on meal_log with trigger error', async () => {
    const log = await db('meal_log').first();
    expect(log).toBeDefined();

    await expect(
      db('meal_log')
        .where('id', log.id)
        .delete()
    ).rejects.toThrow(/meal_log is append-only: DELETE is prohibited/);
  });

  it('should prohibit UPDATE on audit_log with trigger error', async () => {
    // Insert an audit log entry
    const [id] = await db('audit_log').insert({
      admin_id: 1,
      action: 'TEST_ACTION',
      target_type: 'SYSTEM',
      created_at: new Date(),
    });

    await expect(
      db('audit_log')
        .where('id', id)
        .update({ action: 'TAMPERED_ACTION' })
    ).rejects.toThrow(/audit_log is append-only: UPDATE is prohibited/);
  });

  it('should prohibit DELETE on audit_log with trigger error', async () => {
    const log = await db('audit_log').first();
    expect(log).toBeDefined();

    await expect(
      db('audit_log')
        .where('id', log.id)
        .delete()
    ).rejects.toThrow(/audit_log is append-only: DELETE is prohibited/);
  });

  it('should prevent double deduction (duplicate APPROVED meal) for the same student, window, and date', async () => {
    const uniqueSuffix = Date.now().toString().slice(-6);
    const testDate = `2099-01-01`;
    const student = await db('students').orderBy('id', 'desc').first();
    const testStudentId = student.id;

    // Use a unique date so repeated test runs on append-only meal_log don't collide with previous test runs
    const randDays = 10000 + Math.floor(Math.random() * 50000);
    const runDate = new Date(Date.now() + randDays * 86400000).toISOString().split('T')[0];
    const windowId = 1;

    // First approved insert should succeed
    const [firstId] = await db('meal_log').insert({
      student_id: testStudentId,
      meal_window_id: windowId,
      meal_date: runDate,
      method: 'FINGERPRINT',
      result: 'APPROVED',
      created_at: new Date(),
    });
    expect(firstId).toBeDefined();

    // Second approved insert for the same student, window and date must fail with duplicate key
    await expect(
      db('meal_log').insert({
        student_id: testStudentId,
        meal_window_id: windowId,
        meal_date: runDate,
        method: 'FINGERPRINT',
        result: 'APPROVED',
        created_at: new Date(),
      })
    ).rejects.toThrow(/ER_DUP_ENTRY|Duplicate entry/);
  });

  it('should accurately compute student balance from the student_balances view', async () => {
    const student = await db('students').where('id', 1).first();
    const balanceView = await db('student_balances').where('student_id', 1).first();
    const ledgerSum = await db('token_ledger')
      .where('student_id', 1)
      .sum('change_amount as total')
      .first();

    expect(Number(balanceView.balance)).toBe(Number(ledgerSum?.total || 0));
  });
});
