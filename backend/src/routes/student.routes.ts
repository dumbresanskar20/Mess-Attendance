import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticateJWT, requireRole } from '../middlewares/auth.middleware';
import * as studentService from '../services/student.service';
import { logAudit, getClientIp } from '../services/audit.service';

const router = Router();

const createStudentSchema = z.object({
  student_code: z.string().min(2).max(50),
  name: z.string().min(2).max(255),
  phone: z.string().min(10).max(20),
  photo_path: z.string().url().or(z.string().min(1)).optional().nullable(),
  consent_given: z.boolean().default(false),
});

const updateStudentSchema = z.object({
  name: z.string().min(2).max(255).optional(),
  phone: z.string().min(10).max(20).optional(),
  photo_path: z.string().url().or(z.string().min(1)).optional().nullable(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});

// GET /api/students
router.get(
  '/',
  authenticateJWT,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const search = req.query.search as string | undefined;
      const status = req.query.status as 'ACTIVE' | 'INACTIVE' | undefined;
      const filter = req.query.filter as any;
      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 15;

      const result = await studentService.listStudents({
        search,
        status,
        filter,
        page,
        limit,
      });

      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/students
router.post(
  '/',
  authenticateJWT,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = createStudentSchema.parse(req.body);
      const student = await studentService.createStudent(parsed);

      await logAudit({
        adminId: req.user!.id,
        action: 'STUDENT_CREATE',
        targetType: 'STUDENT',
        targetId: student.id,
        detail: { student_code: student.student_code, name: student.name },
        ip: getClientIp(req),
      });

      res.status(201).json(student);
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/students/:id
router.get(
  '/:id',
  authenticateJWT,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const student = await studentService.getStudentById(req.params.id as string);
      res.json(student);
    } catch (error) {
      next(error);
    }
  }
);

// PATCH /api/students/:id
router.patch(
  '/:id',
  authenticateJWT,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = updateStudentSchema.parse(req.body);
      const student = await studentService.updateStudent(req.params.id as string, parsed);

      await logAudit({
        adminId: req.user!.id,
        action: 'STUDENT_UPDATE',
        targetType: 'STUDENT',
        targetId: String(req.params.id),
        detail: parsed,
        ip: getClientIp(req),
      });

      res.json(student);
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/students/:id/deactivate
router.post(
  '/:id/deactivate',
  authenticateJWT,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const student = await studentService.deactivateStudent(req.params.id as string);

      await logAudit({
        adminId: req.user!.id,
        action: 'STUDENT_DEACTIVATE',
        targetType: 'STUDENT',
        targetId: String(req.params.id),
        ip: getClientIp(req),
      });

      res.json({
        message: 'Student and associated fingerprints deactivated successfully',
        student,
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
