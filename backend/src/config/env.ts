import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

// Load .env from various possible working directories
const possibleEnvPaths = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), '../.env'),
  path.resolve(__dirname, '../../.env'),
  path.resolve(__dirname, '../../../.env'),
];
for (const envPath of possibleEnvPaths) {
  dotenv.config({ path: envPath });
}

import { APP_URLS } from './urls';

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  APP_TIMEZONE: z.string().default('Asia/Kolkata'),

  // Database
  DATABASE_URL: z.string().optional().or(z.literal('')),
  DB_HOST: z.string().default('127.0.0.1'),
  DB_PORT: z.coerce.number().default(3306),
  DB_USER: z.string().default('mess_user'),
  DB_PASSWORD: z.string().default('mess_secure_password_2026'),
  DB_NAME: z.string().default('mess_tokens'),
  DB_SSL: z
    .string()
    .optional()
    .transform((val) => val === 'true')
    .or(z.boolean())
    .default(false),

  // Auth
  JWT_ACCESS_SECRET: z.string().min(16).default('super_secret_mess_access_jwt_key_32_chars_long!'),
  JWT_REFRESH_SECRET: z.string().min(16).default('super_secret_mess_refresh_jwt_key_32_chars_long!'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  // Encryption (64 hex characters = 32 bytes AES-256 key)
  FINGERPRINT_ENCRYPTION_KEY: z.string().length(64).default(
    'e4d2938a16c74bc992a514d8f072c49a1b8e6f3d5c7a9b0e2d4f6a8c0e2b4d6f'
  ),

  // CORS & Services
  DASHBOARD_URL: z.string().default(APP_URLS.dashboard),
  BACKEND_URL: z.string().default(APP_URLS.backend),
  CORS_ORIGIN: z.string().default(`${APP_URLS.dashboard},http://localhost:5173`),
  DEVICE_BRIDGE_URL: z
    .string()
    .default(APP_URLS.deviceBridge)
    .transform((val) =>
      process.env.NODE_ENV === 'test' ? 'http://localhost:4001' : val.replace(/\/+$/, '')
    ),

  // Business Policy
  POLICY_EXPIRE_UNUSED_TOKENS: z
    .string()
    .transform((val) => val === 'true')
    .default('false'),

  // Backups
  BACKUP_DIR: z.string().default('./backups'),
  BACKUP_RETENTION_DAYS: z.coerce.number().default(30),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.format());
  process.exit(1);
}

export const env = parsed.data;
