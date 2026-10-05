import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticateJWT, requireRole } from '../middlewares/auth.middleware';
import * as tokenService from '../services/token.service';
import { logAudit, getClientIp } from '../services/audit.service';

const router = Router();

const adjustTokensSchema = z.object({
  studentId: z.coerce.number().positive(),
  amount: z.number().int().refine((val) => val !== 0, {
    message: 'Amount must be non-zero (positive to add, negative to deduct)',
  }),
  reason: z.string().min(3).max(255),
  note: z.string().optional(),
});

// GET /api/students/:id/ledger
router.get(
  '/students/:id/ledger',
  authenticateJWT,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;

      const result = await tokenService.getStudentLedger(req.params.id as string, page, limit);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/tokens/adjust (OWNER only)
router.post(
  '/tokens/adjust',
  authenticateJWT,
  requireRole('OWNER'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = adjustTokensSchema.parse(req.body);
      const combinedNote = parsed.note
        ? `${parsed.reason}: ${parsed.note}`
        : parsed.reason;

      const result = await tokenService.adjustTokens({
        studentId: parsed.studentId,
        amount: parsed.amount,
        note: combinedNote,
        adminId: req.user!.id,
      });

      await logAudit({
        adminId: req.user!.id,
        action: 'TOKEN_ADJUST',
        targetType: 'STUDENT',
        targetId: parsed.studentId,
        detail: {
          amount: parsed.amount,
          reason: parsed.reason,
          previousBalance: result.previousBalance,
          newBalance: result.newBalance,
        },
        ip: getClientIp(req),
      });

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }
);

export default router;
