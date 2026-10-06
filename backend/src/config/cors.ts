import { env } from './env';
import { APP_URLS } from './urls';

const defaultOrigins = [
  APP_URLS.dashboard,
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4000',
  'http://localhost:4001',
];

const envOrigins = [
  env.DASHBOARD_URL,
  ...(env.CORS_ORIGIN ? env.CORS_ORIGIN.split(',') : []),
]
  .filter(Boolean)
  .map((origin) => origin.trim().replace(/\/+$/, ''));

export const allowedOrigins = Array.from(new Set([...defaultOrigins, ...envOrigins]));

export function isOriginAllowed(origin?: string): boolean {
  if (!origin) return true; // Allow non-browser requests or server-to-server calls
  const normalized = origin.trim().replace(/\/+$/, '');
  if (allowedOrigins.some((allowed) => allowed.replace(/\/+$/, '') === normalized)) {
    return true;
  }
  // Allow Vercel preview or production app domains
  if (normalized.endsWith('.vercel.app')) {
    return true;
  }
  // Allow localhost / 127.0.0.1 with any port for local development
  if (normalized.startsWith('http://localhost:') || normalized.startsWith('http://127.0.0.1:')) {
    return true;
  }
  return false;
}
