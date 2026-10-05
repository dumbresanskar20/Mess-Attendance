import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { db } from '../db/connection';
import { authenticateJWT, requireRole } from '../middlewares/auth.middleware';
import { hashPassword } from '../utils/crypto';
import { logAudit, getClientIp } from '../services/audit.service';
import { NotFoundError, ConflictError } from '../middlewares/error.middleware';

const router = Router();

const createStaffSchema = z.object({
  name: z.string().min(2).max(255),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(['OWNER', 'COUNTER']),
});

const updateStaffSchema = z.object({
  name: z.string().min(2).max(255).optional(),
  role: z.enum(['OWNER', 'COUNTER']).optional(),
  is_active: z.boolean().optional(),
  password: z.string().min(6).optional(),
});

// All staff routes require OWNER role
router.use(authenticateJWT, requireRole('OWNER'));

// GET /api/staff
router.get('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const staff = await db('admin_users')
      .select('id', 'name', 'email', 'role', 'is_active', 'created_at')
      .orderBy('id', 'asc');

    res.json(staff);
  } catch (error) {
    next(error);
  }
});

// POST /api/staff
router.post('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const parsed = createStaffSchema.parse(req.body);

    const existing = await db('admin_users')
      .where({ email: parsed.email.toLowerCase().trim() })
      .first();

    if (existing) {
      throw new ConflictError(`User with email "${parsed.email}" already exists`);
    }

    const passwordHash = await hashPassword(parsed.password);

    const [id] = await db('admin_users').insert({
      name: parsed.name.trim(),
      email: parsed.email.toLowerCase().trim(),
      password_hash: passwordHash,
      role: parsed.role,
      is_active: true,
      created_at: new Date(),
    });

    await logAudit({
      adminId: req.user!.id,
      action: 'STAFF_CREATE',
      targetType: 'ADMIN_USER',
      targetId: id,
      detail: { email: parsed.email, role: parsed.role },
      ip: getClientIp(req),
    });

    const user = await db('admin_users')
      .select('id', 'name', 'email', 'role', 'is_active', 'created_at')
      .where('id', id)
      .first();

    res.status(201).json(user);
  } catch (error) {
    next(error);
  }
});

// PATCH /api/staff/:id
router.patch('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = await db('admin_users').where('id', req.params.id).first();
    if (!user) {
      throw new NotFoundError(`Staff account with ID ${req.params.id} not found`);
    }

    const parsed = updateStaffSchema.parse(req.body);

    const updateData: any = {};
    if (parsed.name) updateData.name = parsed.name.trim();
    if (parsed.role) updateData.role = parsed.role;
    if (parsed.is_active !== undefined) updateData.is_active = parsed.is_active;
    if (parsed.password) {
      updateData.password_hash = await hashPassword(parsed.password);
    }

    await db('admin_users').where('id', req.params.id).update(updateData);

    await logAudit({
      adminId: req.user!.id,
      action: 'STAFF_UPDATE',
      targetType: 'ADMIN_USER',
      targetId: String(req.params.id),
      detail: { updatedFields: Object.keys(updateData) },
      ip: getClientIp(req),
    });

    const updated = await db('admin_users')
      .select('id', 'name', 'email', 'role', 'is_active', 'created_at')
      .where('id', req.params.id)
      .first();

    res.json(updated);
  } catch (error) {
    next(error);
  }
});

export default router;
