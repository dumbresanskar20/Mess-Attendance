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

  // Handle Database Connection Failures (e.g. remote MySQL unreachable or not configured)
  if (
    err.code === 'ECONNREFUSED' ||
    err.code === 'ENOTFOUND' ||
    err.code === 'ETIMEDOUT' ||
    err.code === 'ER_ACCESS_DENIED_ERROR' ||
    (typeof err.message === 'string' &&
      (err.message.includes('ECONNREFUSED') || err.message.includes('ETIMEDOUT')))
  ) {
    res.status(503).json({
      error: {
        code: 'DATABASE_CONNECTION_ERROR',
        message: `Database connection failed (${err.code || 'ECONNREFUSED'}). Please configure your MySQL database credentials (DATABASE_URL or DB_HOST, DB_USER, DB_PASSWORD, DB_NAME) in your Render environment variables.`,
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
