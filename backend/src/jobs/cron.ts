import cron from 'node-cron';
import { db } from '../db/connection';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { getCurrentISTDateString } from '../utils/time';
import { createDatabaseBackup } from '../services/backup.service';

export function initCronJobs() {
  logger.info('Initializing automated background cron jobs...');

  // 1. Daily plan expiry check at 00:05 IST
  // '5 0 * * *' in Asia/Kolkata
  cron.schedule(
    '5 0 * * *',
    async () => {
      logger.info('Running daily plan expiry check job...');
      if (!env.POLICY_EXPIRE_UNUSED_TOKENS) {
        logger.info('Policy POLICY_EXPIRE_UNUSED_TOKENS is disabled. Skipping token forfeiture.');
        return;
      }

      try {
        const todayStr = getCurrentISTDateString();

        // Find plans that expired before today
        const expiredPlans = await db('student_plans')
          .where('end_date', '<', todayStr);

        for (const plan of expiredPlans) {
          // Check student current balance
          const [balanceRow] = await db('student_balances').where('student_id', plan.student_id);
          const currentBalance = Number(balanceRow?.balance || 0);

          if (currentBalance > 0) {
            await db('token_ledger').insert({
              student_id: plan.student_id,
              student_plan_id: plan.id,
              change_amount: -currentBalance,
              reason: 'EXPIRY',
              method: 'SYSTEM',
              note: `Automated plan expiry forfeiture on ${todayStr}`,
              created_at: new Date(),
            });
            logger.info(
              { studentId: plan.student_id, forfeited: currentBalance },
              'Forfeited unused tokens due to plan expiry'
            );
          }
        }
      } catch (err) {
        logger.error({ err }, 'Error executing daily plan expiry cron job');
      }
    },
    {
      timezone: 'Asia/Kolkata',
    }
  );

  // 2. Nightly automated database backup at 02:00 IST
  cron.schedule(
    '0 2 * * *',
    async () => {
      logger.info('Running nightly database backup job...');
      try {
        await createDatabaseBackup();
      } catch (err) {
        logger.error({ err }, 'Error during nightly database backup');
      }
    },
    {
      timezone: 'Asia/Kolkata',
    }
  );
}
