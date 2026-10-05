import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticateJWT, requireRole } from '../middlewares/auth.middleware';
import * as planService from '../services/plan.service';
import { logAudit, getClientIp } from '../services/audit.service';

const router = Router();

const createPlanSchema = z.object({
  name: z.string().min(2).max(100),
  price_inr: z.number().positive(),
  tokens: z.number().int().positive(),
  validity_days: z.number().int().positive(),
  meals_per_day: z.number().int().positive().default(2),
});

const updatePlanSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  price_inr: z.number().positive().optional(),
  tokens: z.number().int().positive().optional(),
  validity_days: z.number().int().positive().optional(),
  meals_per_day: z.number().int().positive().optional(),
  is_active: z.boolean().optional(),
});

const sellPlanSchema = z.object({
  planId: z.coerce.number().positive(),
  paymentMode: z.enum(['CASH', 'UPI', 'OTHER']),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

// GET /api/plans
router.get(
  '/',
  authenticateJWT,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const activeOnly = req.query.active === 'true';
      const plans = await planService.listPlans(activeOnly);
      res.json(plans);
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/plans (OWNER only)
router.post(
  '/',
  authenticateJWT,
  requireRole('OWNER'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = createPlanSchema.parse(req.body);
      const plan = await planService.createPlan(parsed);

      await logAudit({
        adminId: req.user!.id,
        action: 'PLAN_CREATE',
        targetType: 'PLAN',
        targetId: plan.id,
        detail: parsed,
        ip: getClientIp(req),
      });

      res.status(201).json(plan);
    } catch (error) {
      next(error);
    }
  }
);

// PATCH /api/plans/:id (OWNER only)
router.patch(
  '/:id',
  authenticateJWT,
  requireRole('OWNER'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = updatePlanSchema.parse(req.body);
      const plan = await planService.updatePlan(req.params.id as string, parsed);

      await logAudit({
        adminId: req.user!.id,
        action: 'PLAN_UPDATE',
        targetType: 'PLAN',
        targetId: String(req.params.id),
        detail: parsed,
        ip: getClientIp(req),
      });

      res.json(plan);
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/students/:id/plans (Sell a plan)
router.post(
  '/students/:id/plans',
  authenticateJWT,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = sellPlanSchema.parse(req.body);
      const result = await planService.sellPlanToStudent({
        studentId: req.params.id as string,
        planId: parsed.planId,
        paymentMode: parsed.paymentMode,
        startDate: parsed.startDate,
        soldBy: req.user!.id,
      });

      await logAudit({
        adminId: req.user!.id,
        action: 'PLAN_SELL',
        targetType: 'STUDENT_PLAN',
        targetId: result.studentPlanId,
        detail: {
          studentId: req.params.id,
          planId: parsed.planId,
          tokensAdded: result.tokensAdded,
          amountPaid: result.amountPaid,
          paymentMode: result.paymentMode,
        },
        ip: getClientIp(req),
      });

      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  }
);

export default router;
