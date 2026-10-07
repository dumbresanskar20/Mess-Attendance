import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('audit_log', (table) => {
    table.bigInteger('admin_id').unsigned().nullable().alter();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('audit_log', (table) => {
    table.bigInteger('admin_id').unsigned().notNullable().alter();
  });
}
