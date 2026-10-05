import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // 1. admin_users
  await knex.schema.createTable('admin_users', (table) => {
    table.bigIncrements('id').primary();
    table.string('name', 255).notNullable();
    table.string('email', 255).notNullable().unique();
    table.string('password_hash', 255).notNullable();
    table.enum('role', ['OWNER', 'COUNTER']).notNullable();
    table.boolean('is_active').notNullable().defaultTo(true);
    table.dateTime('created_at', { precision: 3 }).notNullable().defaultTo(knex.fn.now(3));
  });

  // 2. students
  await knex.schema.createTable('students', (table) => {
    table.bigIncrements('id').primary();
    table.string('student_code', 50).notNullable().unique();
    table.string('name', 255).notNullable();
    table.string('phone', 20).notNullable();
    table.string('photo_path', 500).nullable();
    table.enum('status', ['ACTIVE', 'INACTIVE']).notNullable().defaultTo('ACTIVE');
    table.dateTime('consent_given_at', { precision: 3 }).nullable();
    table.dateTime('created_at', { precision: 3 }).notNullable().defaultTo(knex.fn.now(3));
    table.dateTime('updated_at', { precision: 3 }).notNullable().defaultTo(knex.fn.now(3));
  });

  // 3. fingerprints
  await knex.schema.createTable('fingerprints', (table) => {
    table.bigIncrements('id').primary();
    table.bigInteger('student_id').unsigned().notNullable()
      .references('id').inTable('students').onDelete('RESTRICT');
    table.string('finger_label', 100).notNullable();
    table.specificType('template_encrypted', 'MEDIUMBLOB').notNullable();
    table.string('iv', 64).notNullable();
    table.string('auth_tag', 64).notNullable();
    table.string('device_user_id', 50).nullable();
    table.boolean('is_active').notNullable().defaultTo(true);
    table.bigInteger('enrolled_by').unsigned().notNullable()
      .references('id').inTable('admin_users').onDelete('RESTRICT');
    table.dateTime('enrolled_at', { precision: 3 }).notNullable().defaultTo(knex.fn.now(3));
    table.dateTime('purged_at', { precision: 3 }).nullable();

    table.index(['student_id', 'is_active'], 'idx_fingerprints_student_active');
  });

  // 4. plans
  await knex.schema.createTable('plans', (table) => {
    table.bigIncrements('id').primary();
    table.string('name', 100).notNullable();
    table.decimal('price_inr', 10, 2).notNullable();
    table.integer('tokens').notNullable();
    table.integer('validity_days').notNullable();
    table.integer('meals_per_day').notNullable().defaultTo(2);
    table.boolean('is_active').notNullable().defaultTo(true);
    table.dateTime('created_at', { precision: 3 }).notNullable().defaultTo(knex.fn.now(3));
  });

  // 5. student_plans
  await knex.schema.createTable('student_plans', (table) => {
    table.bigIncrements('id').primary();
    table.bigInteger('student_id').unsigned().notNullable()
      .references('id').inTable('students').onDelete('RESTRICT');
    table.bigInteger('plan_id').unsigned().notNullable()
      .references('id').inTable('plans').onDelete('RESTRICT');
    table.date('start_date').notNullable();
    table.date('end_date').notNullable();
    table.integer('tokens_total').notNullable();
    table.enum('payment_mode', ['CASH', 'UPI', 'OTHER']).notNullable();
    table.decimal('amount_paid_inr', 10, 2).notNullable();
    table.bigInteger('sold_by').unsigned().notNullable()
      .references('id').inTable('admin_users').onDelete('RESTRICT');
    table.dateTime('created_at', { precision: 3 }).notNullable().defaultTo(knex.fn.now(3));

    table.index(['student_id', 'start_date', 'end_date'], 'idx_student_plans_date');
  });

  // 6. meal_windows
  await knex.schema.createTable('meal_windows', (table) => {
    table.bigIncrements('id').primary();
    table.string('name', 50).notNullable();
    table.time('start_time').notNullable();
    table.time('end_time').notNullable();
    table.boolean('is_active').notNullable().defaultTo(true);
    table.dateTime('created_at', { precision: 3 }).notNullable().defaultTo(knex.fn.now(3));
  });

  // 7. meal_log
  await knex.schema.createTable('meal_log', (table) => {
    table.bigIncrements('id').primary();
    table.bigInteger('student_id').unsigned().nullable()
      .references('id').inTable('students').onDelete('RESTRICT');
    table.bigInteger('meal_window_id').unsigned().notNullable()
      .references('id').inTable('meal_windows').onDelete('RESTRICT');
    table.date('meal_date').notNullable();
    table.enum('method', ['FINGERPRINT', 'MANUAL']).notNullable();
    table.bigInteger('fingerprint_id').unsigned().nullable()
      .references('id').inTable('fingerprints').onDelete('RESTRICT');
    table.string('device_id', 100).nullable();
    table.enum('result', ['APPROVED', 'REJECTED']).notNullable();
    table.enum('reject_reason', [
      'NO_MATCH',
      'PLAN_EXPIRED',
      'NO_BALANCE',
      'OUTSIDE_WINDOW',
      'ALREADY_ATE',
      'INACTIVE_STUDENT'
    ]).nullable();
    table.bigInteger('marked_by').unsigned().nullable()
      .references('id').inTable('admin_users').onDelete('RESTRICT');
    table.enum('manual_reason', [
      'FINGER_NOT_READING',
      'WET_OR_OILY_FINGER',
      'DEVICE_DOWN',
      'INJURY',
      'OTHER'
    ]).nullable();
    table.dateTime('created_at', { precision: 3 }).notNullable().defaultTo(knex.fn.now(3));

    table.index(['meal_date', 'meal_window_id'], 'idx_meal_log_date_window');
  });

  // Add generated column and UNIQUE index for approved meals on meal_log
  await knex.raw(`
    ALTER TABLE meal_log
    ADD COLUMN approved_meal_key VARCHAR(120) GENERATED ALWAYS AS (
      IF(result = 'APPROVED' AND student_id IS NOT NULL, CONCAT(student_id, '-', meal_window_id, '-', meal_date), NULL)
    ) STORED,
    ADD UNIQUE INDEX uq_approved_meal_per_window_date (approved_meal_key);
  `);

  // 8. token_ledger
  await knex.schema.createTable('token_ledger', (table) => {
    table.bigIncrements('id').primary();
    table.bigInteger('student_id').unsigned().notNullable()
      .references('id').inTable('students').onDelete('RESTRICT');
    table.bigInteger('student_plan_id').unsigned().notNullable()
      .references('id').inTable('student_plans').onDelete('RESTRICT');
    table.integer('change_amount').notNullable();
    table.enum('reason', ['PLAN_PURCHASE', 'MEAL', 'MANUAL_ADJUST', 'EXPIRY', 'REFUND']).notNullable();
    table.enum('method', ['FINGERPRINT', 'MANUAL', 'SYSTEM']).notNullable();
    table.bigInteger('meal_log_id').unsigned().nullable()
      .references('id').inTable('meal_log').onDelete('RESTRICT');
    table.text('note').nullable();
    table.bigInteger('created_by').unsigned().nullable()
      .references('id').inTable('admin_users').onDelete('RESTRICT');
    table.dateTime('created_at', { precision: 3 }).notNullable().defaultTo(knex.fn.now(3));

    table.index(['student_id', 'created_at'], 'idx_token_ledger_student_created');
  });

  // 9. audit_log
  await knex.schema.createTable('audit_log', (table) => {
    table.bigIncrements('id').primary();
    table.bigInteger('admin_id').unsigned().notNullable()
      .references('id').inTable('admin_users').onDelete('RESTRICT');
    table.string('action', 100).notNullable();
    table.string('target_type', 50).notNullable();
    table.string('target_id', 50).nullable();
    table.json('detail').nullable();
    table.string('ip', 45).nullable();
    table.dateTime('created_at', { precision: 3 }).notNullable().defaultTo(knex.fn.now(3));
  });

  // 10. Triggers for Append-Only tables
  // token_ledger triggers
  await knex.raw(`
    CREATE TRIGGER trg_token_ledger_no_update
    BEFORE UPDATE ON token_ledger
    FOR EACH ROW
    BEGIN
      SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'token_ledger is append-only: UPDATE is prohibited';
    END;
  `);

  await knex.raw(`
    CREATE TRIGGER trg_token_ledger_no_delete
    BEFORE DELETE ON token_ledger
    FOR EACH ROW
    BEGIN
      SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'token_ledger is append-only: DELETE is prohibited';
    END;
  `);

  // meal_log triggers
  await knex.raw(`
    CREATE TRIGGER trg_meal_log_no_update
    BEFORE UPDATE ON meal_log
    FOR EACH ROW
    BEGIN
      SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'meal_log is append-only: UPDATE is prohibited';
    END;
  `);

  await knex.raw(`
    CREATE TRIGGER trg_meal_log_no_delete
    BEFORE DELETE ON meal_log
    FOR EACH ROW
    BEGIN
      SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'meal_log is append-only: DELETE is prohibited';
    END;
  `);

  // audit_log triggers
  await knex.raw(`
    CREATE TRIGGER trg_audit_log_no_update
    BEFORE UPDATE ON audit_log
    FOR EACH ROW
    BEGIN
      SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'audit_log is append-only: UPDATE is prohibited';
    END;
  `);

  await knex.raw(`
    CREATE TRIGGER trg_audit_log_no_delete
    BEFORE DELETE ON audit_log
    FOR EACH ROW
    BEGIN
      SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'audit_log is append-only: DELETE is prohibited';
    END;
  `);

  // 11. SQL View student_balances
  await knex.raw(`
    CREATE OR REPLACE VIEW student_balances AS
    SELECT 
      s.id AS student_id,
      s.student_code,
      s.name,
      s.status,
      COALESCE(SUM(tl.change_amount), 0) AS balance
    FROM students s
    LEFT JOIN token_ledger tl ON s.id = tl.student_id
    GROUP BY s.id, s.student_code, s.name, s.status;
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP VIEW IF EXISTS student_balances;');
  await knex.raw('DROP TRIGGER IF EXISTS trg_audit_log_no_delete;');
  await knex.raw('DROP TRIGGER IF EXISTS trg_audit_log_no_update;');
  await knex.raw('DROP TRIGGER IF EXISTS trg_meal_log_no_delete;');
  await knex.raw('DROP TRIGGER IF EXISTS trg_meal_log_no_update;');
  await knex.raw('DROP TRIGGER IF EXISTS trg_token_ledger_no_delete;');
  await knex.raw('DROP TRIGGER IF EXISTS trg_token_ledger_no_update;');

  await knex.schema.dropTableIfExists('audit_log');
  await knex.schema.dropTableIfExists('token_ledger');
  await knex.schema.dropTableIfExists('meal_log');
  await knex.schema.dropTableIfExists('meal_windows');
  await knex.schema.dropTableIfExists('student_plans');
  await knex.schema.dropTableIfExists('plans');
  await knex.schema.dropTableIfExists('fingerprints');
  await knex.schema.dropTableIfExists('students');
  await knex.schema.dropTableIfExists('admin_users');
}
