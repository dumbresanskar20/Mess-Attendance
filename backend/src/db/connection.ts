import knex, { Knex } from 'knex';
import knexConfig from './knexfile';
import { env } from '../config/env';

const environment = env.NODE_ENV || 'development';
const config = knexConfig[environment] || knexConfig.development;

export const db: Knex = knex(config);

export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    await db.raw('SELECT 1');
    return true;
  } catch (error) {
    console.error('Database connection failed:', error);
    return false;
  }
}
