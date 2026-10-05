import http from 'http';
import { createApp } from './app';
import { env } from './config/env';
import { logger } from './utils/logger';
import { checkDatabaseConnection } from './db/connection';
import { initSocket } from './socket';
import { initCronJobs } from './jobs/cron';

const app = createApp();
const server = http.createServer(app);

// Initialize Socket.IO
export const io = initSocket(server);

async function startServer() {
  const isDbReady = await checkDatabaseConnection();
  if (!isDbReady) {
    logger.warn('Initial database ping failed. Server will continue and retry on requests.');
  } else {
    logger.info('Connected to MySQL database successfully.');
    initCronJobs();
  }

  server.listen(env.PORT, () => {
    logger.info(`Mess Token Backend Server running on port ${env.PORT} (${env.NODE_ENV})`);
    logger.info(`Timezone configured as: ${env.APP_TIMEZONE}`);
  });
}

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    logger.info('HTTP server closed.');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received. Shutting down gracefully...');
  server.close(() => {
    logger.info('HTTP server closed.');
    process.exit(0);
  });
});

startServer().catch((err) => {
  logger.fatal({ err }, 'Fatal error during server startup');
  process.exit(1);
});
