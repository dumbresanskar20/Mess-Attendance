import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { env } from './config/env';
import { logger } from './utils/logger';
import { errorHandler } from './middlewares/error.middleware';
import authRoutes from './routes/auth.routes';
import studentRoutes from './routes/student.routes';
import planRoutes from './routes/plan.routes';
import tokenRoutes from './routes/token.routes';
import staffRoutes from './routes/staff.routes';
import auditRoutes from './routes/audit.routes';
import mealRoutes from './routes/meal.routes';
import fingerprintRoutes from './routes/fingerprint.routes';
import dashboardRoutes from './routes/dashboard.routes';
import reportRoutes from './routes/report.routes';
import { checkDatabaseConnection } from './db/connection';

import { isOriginAllowed } from './config/cors';

export function createApp(): Express {
  const app = express();

  // Security middlewares
  app.use(helmet());
  app.use(
    cors({
      origin: (origin, callback) => {
        if (isOriginAllowed(origin)) {
          callback(null, true);
        } else {
          callback(new Error(`Origin ${origin} not allowed by CORS`));
        }
      },
      credentials: true,
    })
  );

  // Body parser
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Logging (in non-test environments)
  if (env.NODE_ENV !== 'test') {
    app.use(
      pinoHttp({
        logger,
        autoLogging: {
          ignore: (req) => req.url === '/api/health',
        },
      })
    );
  }

  // Health check endpoint
  app.get('/api/health', async (req, res) => {
    const isDbConnected = await checkDatabaseConnection();
    res.json({
      status: isDbConnected ? 'UP' : 'DEGRADED',
      database: isDbConnected ? 'CONNECTED' : 'DISCONNECTED',
      timestamp: new Date().toISOString(),
      timezone: env.APP_TIMEZONE,
    });
  });

  // Mount API routes
  app.use('/api/auth', authRoutes);
  app.use('/api/students', studentRoutes);
  app.use('/api/plans', planRoutes);
  app.use('/api/tokens', tokenRoutes);
  app.use('/api/staff', staffRoutes);
  app.use('/api/audit', auditRoutes);
  app.use('/api', mealRoutes);
  app.use('/api', fingerprintRoutes);
  app.use('/api/dashboard', dashboardRoutes);
  app.use('/api/reports', reportRoutes);

  // Direct alias for POST /api/students/:id/plans and GET /api/students/:id/ledger as specified in prompt section 8
  app.use('/api', planRoutes);
  app.use('/api', tokenRoutes);

  // Global error handler
  app.use(errorHandler);

  return app;
}
