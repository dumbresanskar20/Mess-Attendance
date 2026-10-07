import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { db } from '../db/connection';
import { authenticateJWT } from '../middlewares/auth.middleware';
import { authenticateDevice } from '../middlewares/deviceAuth.middleware';
import * as scanService from '../services/scan.service';
import { logAudit, getClientIp } from '../services/audit.service';

const router = Router();

const scanSchema = z.object({
  deviceUserId: z.string().optional(),
  fingerprintId: z.coerce.number().optional(),
  studentId: z.coerce.number().optional(),
  deviceId: z.string().optional(),
  event_id: z.string().optional(),
  eventId: z.string().optional(),
  simulatedWindowId: z.coerce.number().optional(),
});

const manualMealSchema = z.object({
  studentId: z.coerce.number().positive(),
  manualReason: z.enum([
    'FINGER_NOT_READING',
    'WET_OR_OILY_FINGER',
    'DEVICE_DOWN',
    'INJURY',
    'OTHER',
  ]),
  note: z.string().optional(),
  simulatedWindowId: z.coerce.number().optional(),
});

// GET /api/meal-windows (Active meal windows)
router.get(
  '/meal-windows',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const windows = await db('meal_windows')
        .where('is_active', true)
        .orderBy('start_time', 'asc');
      res.json(windows);
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/scan (Device Bridge & Counter Scanner - Requires valid device signature)
router.post(
  '/scan',
  authenticateDevice,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = scanSchema.parse(req.body);
      const outcome = await scanService.processScan({
        deviceUserId: parsed.deviceUserId,
        fingerprintId: parsed.fingerprintId,
        studentId: parsed.studentId,
        deviceId: parsed.deviceId || req.device?.device_id,
        eventId: parsed.eventId || parsed.event_id,
        simulatedWindowId: parsed.simulatedWindowId,
      });
      res.json(outcome);
    } catch (error) {
      next(error);
    }
  }
);


// POST /api/meals/manual (Counter Staff Manual Entry)
router.post(
  '/meals/manual',
  authenticateJWT,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = manualMealSchema.parse(req.body);

      const outcome = await scanService.processManualMeal({
        studentId: parsed.studentId,
        manualReason: parsed.manualReason,
        note: parsed.note,
        adminId: req.user!.id,
        simulatedWindowId: parsed.simulatedWindowId,
      });

      await logAudit({
        adminId: req.user!.id,
        action: 'MANUAL_MEAL_MARKED',
        targetType: 'STUDENT',
        targetId: parsed.studentId,
        detail: {
          manualReason: parsed.manualReason,
          result: outcome.result,
          rejectReason: outcome.rejectReason,
          note: parsed.note,
        },
        ip: getClientIp(req),
      });

      res.json(outcome);
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/meals (Meal log list)
router.get(
  '/meals',
  authenticateJWT,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const startDate = req.query.startDate as string | undefined;
      const endDate = req.query.endDate as string | undefined;
      const windowId = req.query.windowId ? parseInt(req.query.windowId as string, 10) : undefined;
      const studentId = req.query.studentId ? parseInt(req.query.studentId as string, 10) : undefined;
      const method = req.query.method as any;
      const result = req.query.result as any;
      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;

      const response = await scanService.listMeals({
        startDate,
        endDate,
        windowId,
        studentId,
        method,
        result,
        page,
        limit,
      });

      res.json(response);
    } catch (error) {
      next(error);
    }
  }
);

export default router;
