import { db } from '../db/connection';

async function clearData() {
  console.log('Connecting to database and clearing all demo/operational data...');

  try {
    // 1. Disable FK checks and drop append-only triggers
    await db.raw('SET FOREIGN_KEY_CHECKS = 0;');

    await db.raw('DROP TRIGGER IF EXISTS trg_audit_log_no_delete;');
    await db.raw('DROP TRIGGER IF EXISTS trg_audit_log_no_update;');
    await db.raw('DROP TRIGGER IF EXISTS trg_meal_log_no_delete;');
    await db.raw('DROP TRIGGER IF EXISTS trg_meal_log_no_update;');
    await db.raw('DROP TRIGGER IF EXISTS trg_token_ledger_no_delete;');
    await db.raw('DROP TRIGGER IF EXISTS trg_token_ledger_no_update;');

    // 2. Truncate operational and demo tables
    console.log('Truncating tables: audit_log, token_ledger, meal_log, student_plans, fingerprints, students, refresh_tokens, admin_users, devices...');
    await db('audit_log').truncate();
    await db('token_ledger').truncate();
    await db('meal_log').truncate();
    await db('student_plans').truncate();
    await db('fingerprints').truncate();
    await db('students').truncate();

    const hasRefreshTokens = await db.schema.hasTable('refresh_tokens');
    if (hasRefreshTokens) {
      await db('refresh_tokens').truncate();
    }

    const hasDevices = await db.schema.hasTable('devices');
    if (hasDevices) {
      await db('devices').truncate();
    }

    // Clear demo admin users so initial setup wizard can configure a real Owner account
    await db('admin_users').truncate();

    // Ensure plans exist
    const planCount = await db('plans').count<{ count: number | string }>('id as count').first();
    if (Number(planCount?.count || 0) === 0) {
      await db('plans').insert([
        { id: 1, name: 'Starter Plan (15 Days)', price_inr: 1800.0, tokens: 30, validity_days: 15, meals_per_day: 2, is_active: true, created_at: new Date() },
        { id: 2, name: 'Standard Monthly (30 Days)', price_inr: 3300.0, tokens: 60, validity_days: 30, meals_per_day: 2, is_active: true, created_at: new Date() },
        { id: 3, name: 'Executive Plan (45 Days)', price_inr: 4800.0, tokens: 90, validity_days: 45, meals_per_day: 2, is_active: true, created_at: new Date() },
      ]);
    }

    // Ensure meal windows exist
    const windowCount = await db('meal_windows').count<{ count: number | string }>('id as count').first();
    if (Number(windowCount?.count || 0) === 0) {
      await db('meal_windows').insert([
        { id: 1, name: 'Lunch', start_time: '11:30:00', end_time: '16:00:00', is_active: true, created_at: new Date() },
        { id: 2, name: 'Dinner', start_time: '18:30:00', end_time: '22:30:00', is_active: true, created_at: new Date() },
        { id: 3, name: 'Breakfast', start_time: '06:30:00', end_time: '11:30:00', is_active: true, created_at: new Date() },
        { id: 4, name: 'Snacks', start_time: '16:00:00', end_time: '18:30:00', is_active: true, created_at: new Date() },
      ]);
    }

    // 3. Re-create append-only triggers
    console.log('Re-creating security triggers...');
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

    // 4. Print table row counts
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

    console.log('\n--- Final Database Table Counts ---');
    for (const table of tables) {
      const [{ count }] = await db(table).count('id as count');
      console.log(`${table.padEnd(16)}: ${count} rows`);
    }

    console.log('\nAll demo data and demo users wiped clean. Database is ready for full authentication & setup.');
    process.exit(0);
  } catch (error) {
    console.error('Error clearing database:', error);
    process.exit(1);
  }
}

clearData();
