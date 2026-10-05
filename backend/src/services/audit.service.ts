import { Request } from 'express';
import { db } from '../db/connection';
import { logger } from '../utils/logger';

export interface AuditParams {
  adminId: string | number;
  action: string;
  targetType: string;
  targetId?: string | number | null;
  detail?: any;
  ip?: string | null;
}

export async function logAudit(params: AuditParams): Promise<void> {
  try {
    await db('audit_log').insert({
      admin_id: params.adminId,
      action: params.action,
      target_type: params.targetType,
      target_id: params.targetId ? String(params.targetId) : null,
      detail: params.detail ? JSON.stringify(params.detail) : null,
      ip: params.ip || null,
      created_at: new Date(),
    });
  } catch (error) {
    logger.error({ error, params }, 'Failed to record audit log');
  }
}

export function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket.remoteAddress || 'unknown';
}
