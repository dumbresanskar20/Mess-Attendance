import { Router, Request, Response, NextFunction } from 'express';
import { db } from '../db/connection';
import { authenticateJWT, requireRole } from '../middlewares/auth.middleware';

const router = Router();

// All audit routes require OWNER role
router.use(authenticateJWT, requireRole('OWNER'));

// GET /api/audit
router.get('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 25;
    const offset = (page - 1) * limit;

    const action = req.query.action as string | undefined;
    const targetType = req.query.targetType as string | undefined;

    let query = db('audit_log as al')
      .leftJoin('admin_users as a', 'al.admin_id', 'a.id')
      .select(
        'al.id',
        'al.action',
        'al.target_type',
        'al.target_id',
        'al.detail',
        'al.ip',
        'al.created_at',
        'a.name as admin_name',
        'a.email as admin_email',
        'a.role as admin_role'
      );

    let countQuery = db('audit_log');

    if (action) {
      query = query.where('al.action', action);
      countQuery = countQuery.where('action', action);
    }

    if (targetType) {
      query = query.where('al.target_type', targetType);
      countQuery = countQuery.where('target_type', targetType);
    }

    const [countResult] = await countQuery.count('id as total');
    const total = Number(countResult?.total || 0);

    const logs = await query
      .orderBy('al.created_at', 'desc')
      .limit(limit)
      .offset(offset);

    // Format detail JSON if stored as string
    const formattedLogs = logs.map((log) => ({
      ...log,
      detail: typeof log.detail === 'string' ? JSON.parse(log.detail) : log.detail,
    }));

    res.json({
      data: formattedLogs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
