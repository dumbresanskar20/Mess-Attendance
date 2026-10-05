import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { logger } from '../utils/logger';

export class AppError extends Error {
  public statusCode: number;
  public code: string;

  constructor(message: string, statusCode = 400, code = 'BAD_REQUEST') {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 404, 'NOT_FOUND');
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Access forbidden for your role') {
    super(message, 403, 'FORBIDDEN');
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Conflict detected') {
    super(message, 409, 'CONFLICT');
  }
}

export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  logger.error({ err, path: req.path, method: req.method }, 'Request error occurred');

  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
      },
    });
    return;
  }

  if (err instanceof ZodError) {
    const message = err.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: message || 'Invalid input data',
      },
    });
    return;
  }

  // Handle MySQL Trigger / Specific MySQL Errors
  if (err.code === 'ER_SIGNAL_EXCEPTION' || err.sqlState === '45000') {
    res.status(400).json({
      error: {
        code: 'DATABASE_TRIGGER_ERROR',
        message: err.sqlMessage || err.message,
      },
    });
    return;
  }

  if (err.code === 'ER_DUP_ENTRY') {
    res.status(409).json({
      error: {
        code: 'DUPLICATE_ENTRY',
        message: 'A duplicate record already exists',
      },
    });
    return;
  }

  // Fallback 500 error
  console.error('Unhandled 500 error in test/dev:', err);
  res.status(500).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: err.message || 'An unexpected internal error occurred',
    },
  });
}
