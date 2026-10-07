import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // 1. Create devices table if it doesn't already exist
  const hasDevices = await knex.schema.hasTable('devices');
  if (!hasDevices) {
    await knex.schema.createTable('devices', (table) => {
      table.bigIncrements('id').primary();
      table.string('device_id', 100).notNullable().unique();
      table.string('name', 255).notNullable();
      table.string('secret_hash', 255).notNullable();
      table.boolean('is_active').notNullable().defaultTo(true);
      table.dateTime('last_heartbeat_at', { precision: 3 }).nullable();
      table.dateTime('created_at', { precision: 3 }).notNullable().defaultTo(knex.fn.now(3));
      table.dateTime('updated_at', { precision: 3 }).notNullable().defaultTo(knex.fn.now(3));
    });
  }

  // 2. Add event_id to meal_log for idempotency if it doesn't exist
  const hasEventId = await knex.schema.hasColumn('meal_log', 'event_id');
  if (!hasEventId) {
    await knex.schema.alterTable('meal_log', (table) => {
      table.string('event_id', 100).nullable().unique();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasEventId = await knex.schema.hasColumn('meal_log', 'event_id');
  if (hasEventId) {
    await knex.schema.alterTable('meal_log', (table) => {
      table.dropUnique(['event_id']);
      table.dropColumn('event_id');
    });
  }
  await knex.schema.dropTableIfExists('devices');
}
