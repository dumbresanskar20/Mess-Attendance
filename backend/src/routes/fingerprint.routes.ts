import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { db } from '../db/connection';
import { authenticateJWT, requireRole } from '../middlewares/auth.middleware';
import { encryptTemplate, decryptTemplate } from '../utils/crypto';
import { AppError, NotFoundError, ForbiddenError } from '../middlewares/error.middleware';
import { logAudit, getClientIp } from '../services/audit.service';
import { env } from '../config/env';

const router = Router();

const enrollFingerprintSchema = z.object({
  finger_label: z.string().min(2).max(100),
  device_user_id: z.string().optional(),
  raw_template: z.string().optional(),
});

// GET /api/students/:id/fingerprints
router.get(
  '/students/:id/fingerprints',
  authenticateJWT,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const student = await db('students').where('id', req.params.id).first();
      if (!student) {
        throw new NotFoundError(`Student with ID ${req.params.id} not found`);
      }

      // Security requirement: NEVER return template_encrypted, iv, or auth_tag in API response!
      const fingerprints = await db('fingerprints as f')
        .leftJoin('admin_users as a', 'f.enrolled_by', 'a.id')
        .where('f.student_id', req.params.id)
        .select(
          'f.id',
          'f.student_id',
          'f.finger_label',
          'f.device_user_id',
          'f.is_active',
          'f.enrolled_at',
          'f.purged_at',
          'a.name as enrolled_by_name'
        )
        .orderBy('f.enrolled_at', 'desc');

      res.json({
        studentId: student.id,
        studentName: student.name,
        consentGivenAt: student.consent_given_at,
        data: fingerprints,
        activeCount: fingerprints.filter((f) => f.is_active).length,
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/students/:id/fingerprints/enroll
router.post(
  '/students/:id/fingerprints/enroll',
  authenticateJWT,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = enrollFingerprintSchema.parse(req.body);

      const student = await db('students').where('id', req.params.id).first();
      if (!student) {
        throw new NotFoundError(`Student with ID ${req.params.id} not found`);
      }

      // Requirement: Consent must be given before biometric enrollment
      if (!student.consent_given_at) {
        throw new AppError(
          'Biometric consent is required before enrolling fingerprints. Please update student consent first.',
          400,
          'CONSENT_REQUIRED'
        );
      }

      // Check max fingers (max 5 recommended)
      const [countRes] = await db('fingerprints')
        .where({ student_id: student.id, is_active: true })
        .count('id as total');
      const activeCount = Number(countRes?.total || 0);

      if (activeCount >= 5) {
        throw new AppError('Maximum of 5 active fingerprints allowed per student', 400, 'MAX_FINGERS_EXCEEDED');
      }

      const deviceUserId = parsed.device_user_id || `${student.id}_${activeCount + 1}`;
      const rawTemplate =
        parsed.raw_template ||
        `ZKT_ENROLLED_TEMPLATE_${student.student_code}_${parsed.finger_label}_${Date.now()}`;

      // Encrypt template using AES-256-GCM
      const encrypted = encryptTemplate(rawTemplate);

      const [fingerprintId] = await db('fingerprints').insert({
        student_id: student.id,
        finger_label: parsed.finger_label,
        template_encrypted: encrypted.ciphertext,
        iv: encrypted.iv,
        auth_tag: encrypted.authTag,
        device_user_id: deviceUserId,
        is_active: true,
        enrolled_by: req.user!.id,
        enrolled_at: new Date(),
      });

      // Forward to device bridge if bridge is up
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 2000);
        await fetch(`${env.DEVICE_BRIDGE_URL}/sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            templates: [
              {
                deviceUserId,
                fingerIndex: activeCount + 1,
                template: rawTemplate,
              },
            ],
          }),
          signal: controller.signal,
        });
        clearTimeout(timeout);
      } catch (err) {
        // Bridge may be offline; template is safely stored in database
      }

      await logAudit({
        adminId: req.user!.id,
        action: 'FINGERPRINT_ENROLL',
        targetType: 'FINGERPRINT',
        targetId: fingerprintId,
        detail: {
          studentId: student.id,
          finger_label: parsed.finger_label,
          device_user_id: deviceUserId,
        },
        ip: getClientIp(req),
      });

      res.status(201).json({
        id: fingerprintId,
        student_id: student.id,
        finger_label: parsed.finger_label,
        device_user_id: deviceUserId,
        is_active: true,
        enrolled_at: new Date(),
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/fingerprints/:id/deactivate
router.post(
  '/fingerprints/:id/deactivate',
  authenticateJWT,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const fingerprint = await db('fingerprints').where('id', req.params.id).first();
      if (!fingerprint) {
        throw new NotFoundError(`Fingerprint with ID ${req.params.id} not found`);
      }

      await db('fingerprints').where('id', req.params.id).update({
        is_active: false,
      });

      await logAudit({
        adminId: req.user!.id,
        action: 'FINGERPRINT_DEACTIVATE',
        targetType: 'FINGERPRINT',
        targetId: String(req.params.id),
        detail: { studentId: fingerprint.student_id, finger_label: fingerprint.finger_label },
        ip: getClientIp(req),
      });

      res.json({ success: true, message: 'Fingerprint deactivated' });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/fingerprints/:id/purge (OWNER only: Permanently erase biometric template)
router.post(
  '/fingerprints/:id/purge',
  authenticateJWT,
  requireRole('OWNER'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const fingerprint = await db('fingerprints').where('id', req.params.id).first();
      if (!fingerprint) {
        throw new NotFoundError(`Fingerprint with ID ${req.params.id} not found`);
      }

      // Erase sensitive biometric data permanently, retaining student history
      await db('fingerprints')
        .where('id', req.params.id)
        .update({
          template_encrypted: Buffer.from(''),
          iv: 'PURGED',
          auth_tag: 'PURGED',
          is_active: false,
          purged_at: new Date(),
        });

      await logAudit({
        adminId: req.user!.id,
        action: 'FINGERPRINT_PURGE',
        targetType: 'FINGERPRINT',
        targetId: String(req.params.id),
        detail: {
          studentId: fingerprint.student_id,
          finger_label: fingerprint.finger_label,
          purgedAt: new Date().toISOString(),
        },
        ip: getClientIp(req),
      });

      res.json({
        success: true,
        message: 'Biometric template permanently purged from database in compliance with privacy regulations',
      });
    } catch (error) {
      next(error);
    }
  }
);



// POST /api/device/enroll (Trigger external biometric device enrollment)
router.post(
  '/device/enroll',
  authenticateJWT,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { deviceUserId, fingerIndex } = req.body;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      const bridgeRes = await fetch(`${env.DEVICE_BRIDGE_URL}/enroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceUserId, fingerIndex: fingerIndex || 1 }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!bridgeRes.ok) {
        const errorData: any = await bridgeRes.json().catch(() => ({}));
        throw new AppError(errorData.error || 'External device enrollment failed', bridgeRes.status);
      }

      const data = await bridgeRes.json();
      res.json(data);
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/device/sync (Re-upload all active templates to device)
router.post(
  '/device/sync',
  authenticateJWT,
  requireRole('OWNER'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const activeFingers = await db('fingerprints')
        .where('is_active', true)
        .whereNotNull('template_encrypted');

      const decryptedPayloads: any[] = [];
      for (const f of activeFingers) {
        if (f.template_encrypted && f.iv && f.auth_tag && f.iv !== 'PURGED') {
          try {
            const raw = decryptTemplate(f.template_encrypted, f.iv, f.auth_tag);
            decryptedPayloads.push({
              deviceUserId: f.device_user_id || String(f.id),
              fingerIndex: 1,
              template: raw.toString('utf-8'),
            });
          } catch (e) {
            // Skip invalid/tampered templates
          }
        }
      }

      let bridgeResult = { success: false, syncedCount: 0 };
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 2000);
        const bridgeRes = await fetch(`${env.DEVICE_BRIDGE_URL}/sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ templates: decryptedPayloads }),
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (bridgeRes.ok) {
          bridgeResult = await bridgeRes.json();
        }
      } catch (err) {
        // Bridge unreachable
      }

      await logAudit({
        adminId: req.user!.id,
        action: 'DEVICE_SYNC',
        targetType: 'DEVICE',
        detail: { totalActive: activeFingers.length, syncedCount: bridgeResult.syncedCount },
        ip: getClientIp(req),
      });

      res.json({
        success: true,
        totalTemplatesInDb: activeFingers.length,
        syncedToDevice: bridgeResult.syncedCount,
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
