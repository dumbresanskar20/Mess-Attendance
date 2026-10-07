import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasMustChange = await knex.schema.hasColumn('admin_users', 'must_change_password');
  if (!hasMustChange) {
    await knex.schema.alterTable('admin_users', (table) => {
      table.boolean('must_change_password').notNullable().defaultTo(false);
      table.integer('failed_login_attempts').notNullable().defaultTo(0);
      table.dateTime('locked_until', { precision: 3 }).nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasMustChange = await knex.schema.hasColumn('admin_users', 'must_change_password');
  if (hasMustChange) {
    await knex.schema.alterTable('admin_users', (table) => {
      table.dropColumn('must_change_password');
      table.dropColumn('failed_login_attempts');
      table.dropColumn('locked_until');
    });
  }
}
