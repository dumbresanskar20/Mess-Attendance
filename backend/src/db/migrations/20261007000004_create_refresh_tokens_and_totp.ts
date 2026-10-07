import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // 1. Add TOTP 2FA fields to admin_users
  const hasTotpEnabled = await knex.schema.hasColumn('admin_users', 'totp_enabled');
  if (!hasTotpEnabled) {
    await knex.schema.alterTable('admin_users', (table) => {
      table.string('totp_secret', 255).nullable();
      table.boolean('totp_enabled').notNullable().defaultTo(false);
    });
  }

  // 2. Create refresh_tokens table for token rotation, tracking, and revocation
  const hasRefreshTokens = await knex.schema.hasTable('refresh_tokens');
  if (!hasRefreshTokens) {
    await knex.schema.createTable('refresh_tokens', (table) => {
      table.bigIncrements('id').primary();
      table
        .bigInteger('admin_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('admin_users')
        .onDelete('CASCADE');
      table.string('token_hash', 64).notNullable().unique().index();
      table.string('family_id', 64).notNullable().index();
      table.boolean('is_revoked').notNullable().defaultTo(false).index();
      table.dateTime('expires_at', { precision: 3 }).notNullable().index();
      table.dateTime('created_at', { precision: 3 }).notNullable().defaultTo(knex.fn.now(3));
      table.dateTime('revoked_at', { precision: 3 }).nullable();
      table.string('replaced_by_hash', 64).nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('refresh_tokens');
  const hasTotpEnabled = await knex.schema.hasColumn('admin_users', 'totp_enabled');
  if (hasTotpEnabled) {
    await knex.schema.alterTable('admin_users', (table) => {
      table.dropColumn('totp_secret');
      table.dropColumn('totp_enabled');
    });
  }
}
