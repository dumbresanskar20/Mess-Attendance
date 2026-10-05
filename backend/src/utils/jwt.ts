import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { AuthUserPayload } from '../types';

export function signAccessToken(payload: AuthUserPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN as any,
  });
}

export function signRefreshToken(payload: AuthUserPayload): string {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN as any,
  });
}

export function verifyAccessToken(token: string): AuthUserPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as AuthUserPayload;
}

export function verifyRefreshToken(token: string): AuthUserPayload {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as AuthUserPayload;
}
