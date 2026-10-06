import type { Knex } from 'knex';
import path from 'path';
import { env } from '../config/env';

const isRemoteHost = env.DB_HOST && !['127.0.0.1', 'localhost'].includes(env.DB_HOST);
const useSsl = env.DB_SSL || isRemoteHost;

const baseConnection: any = {
  host: env.DB_HOST,
  port: env.DB_PORT,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  database: env.DB_NAME,
  timezone: '+00:00', // DB stores UTC
  charset: 'utf8mb4',
  multipleStatements: true,
  ...(useSsl ? { ssl: { rejectUnauthorized: false } } : {}),
};

const config: { [key: string]: Knex.Config } = {
  development: {
    client: 'mysql2',
    connection: baseConnection,
    pool: {
      min: 2,
      max: 10,
    },
    migrations: {
      directory: path.resolve(__dirname, 'migrations'),
      extension: 'ts',
      tableName: 'knex_migrations',
    },
    seeds: {
      directory: path.resolve(__dirname, 'seeds'),
      extension: 'ts',
    },
  },
  test: {
    client: 'mysql2',
    connection: baseConnection,
    pool: {
      min: 1,
      max: 5,
    },
    migrations: {
      directory: path.resolve(__dirname, 'migrations'),
      extension: 'ts',
    },
    seeds: {
      directory: path.resolve(__dirname, 'seeds'),
      extension: 'ts',
    },
  },
  production: {
    client: 'mysql2',
    connection: baseConnection,
    pool: {
      min: 2,
      max: 20,
    },
    migrations: {
      directory: path.resolve(__dirname, 'migrations'),
      extension: 'ts',
    },
    seeds: {
      directory: path.resolve(__dirname, 'seeds'),
      extension: 'ts',
    },
  },
};

export default config;
