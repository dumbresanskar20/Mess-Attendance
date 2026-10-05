import pino from 'pino';
import { env } from '../config/env';

export const logger = pino({
  level: env.NODE_ENV === 'test' ? 'silent' : 'info',
  redact: {
    paths: [
      'password',
      'password_hash',
      'template',
      'template_encrypted',
      'req.headers.authorization',
      '*.password',
      '*.password_hash',
      '*.template',
      '*.template_encrypted',
    ],
    censor: '[REDACTED]',
  },
  transport:
    env.NODE_ENV !== 'production' && env.NODE_ENV !== 'test'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
          },
        }
      : undefined,
});
