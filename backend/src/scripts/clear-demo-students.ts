import { db } from '../db/connection';

async function removeDemoStudents() {
  console.log('[Clear] Connecting to database to remove demo student records...');

  try {
    // 1. Disable FK checks and drop append-only triggers
    await db.raw('SET FOREIGN_KEY_CHECKS = 0;');

    await db.raw('DROP TRIGGER IF EXISTS trg_audit_log_no_delete;');
    await db.raw('DROP TRIGGER IF EXISTS trg_audit_log_no_update;');
    await db.raw('DROP TRIGGER IF EXISTS trg_meal_log_no_delete;');
    await db.raw('DROP TRIGGER IF EXISTS trg_meal_log_no_update;');
    await db.raw('DROP TRIGGER IF EXISTS trg_token_ledger_no_delete;');
    await db.raw('DROP TRIGGER IF EXISTS trg_token_ledger_no_update;');

    // 2. Truncate student-related operational tables
    console.log('[Clear] Truncating student tables: token_ledger, meal_log, student_plans, fingerprints, students...');
    await db('token_ledger').truncate();
    await db('meal_log').truncate();
    await db('student_plans').truncate();
    await db('fingerprints').truncate();
    await db('students').truncate();

    // 3. Remove audit logs for student demo events
    console.log('[Clear] Cleaning student-related audit log entries...');
    await db('audit_log')
      .whereIn('action', [
        'STUDENT_CREATE',
        'STUDENT_DEACTIVATE',
        'STUDENT_ACTIVATE',
        'STUDENT_UPDATE',
        'FINGERPRINT_ENROLL',
        'FINGERPRINT_DEACTIVATE',
        'FINGERPRINT_PURGE',
        'PLAN_SELL',
        'TOKEN_ADJUST',
        'MANUAL_MEAL_MARKED',
        'TEST_ACTION',
      ])
      .delete();

    // 4. Re-create append-only triggers
    console.log('[Clear] Re-creating security triggers...');
    await db.raw(`
      CREATE TRIGGER trg_token_ledger_no_update
      BEFORE UPDATE ON token_ledger
      FOR EACH ROW
      BEGIN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'token_ledger is append-only: UPDATE is prohibited';
      END;
    `);

    await db.raw(`
      CREATE TRIGGER trg_token_ledger_no_delete
      BEFORE DELETE ON token_ledger
      FOR EACH ROW
      BEGIN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'token_ledger is append-only: DELETE is prohibited';
      END;
    `);

    await db.raw(`
      CREATE TRIGGER trg_meal_log_no_update
      BEFORE UPDATE ON meal_log
      FOR EACH ROW
      BEGIN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'meal_log is append-only: UPDATE is prohibited';
      END;
    `);

    await db.raw(`
      CREATE TRIGGER trg_meal_log_no_delete
      BEFORE DELETE ON meal_log
      FOR EACH ROW
      BEGIN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'meal_log is append-only: DELETE is prohibited';
      END;
    `);

    await db.raw(`
      CREATE TRIGGER trg_audit_log_no_update
      BEFORE UPDATE ON audit_log
      FOR EACH ROW
      BEGIN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'audit_log is append-only: UPDATE is prohibited';
      END;
    `);

    await db.raw(`
      CREATE TRIGGER trg_audit_log_no_delete
      BEFORE DELETE ON audit_log
      FOR EACH ROW
      BEGIN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'audit_log is append-only: DELETE is prohibited';
      END;
    `);

    await db.raw('SET FOREIGN_KEY_CHECKS = 1;');

    // 5. Verify counts
    const tables = [
      'students',
      'fingerprints',
      'student_plans',
      'plans',
      'token_ledger',
      'meal_log',
      'audit_log',
      'admin_users',
      'meal_windows',
    ];

    console.log('\n--- Current Database Table Counts ---');
    for (const table of tables) {
      const [{ count }] = await db(table).count('id as count');
      console.log(`${table.padEnd(16)}: ${count} rows`);
    }

    console.log('\n[Success] Demo student records removed. Admin users and system configurations preserved.');
    process.exit(0);
  } catch (error) {
    console.error('[Error] Failed to remove demo records:', error);
    process.exit(1);
  }
}

removeDemoStudents();
