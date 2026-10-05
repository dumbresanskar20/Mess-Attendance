import fs from 'fs';
import path from 'path';
import { db } from '../db/connection';
import { env } from '../config/env';
import { logger } from '../utils/logger';

export async function createDatabaseBackup(): Promise<string> {
  const backupDir = path.resolve(process.cwd(), env.BACKUP_DIR);
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `backup_mess_tokens_${timestamp}.json`;
  const filePath = path.join(backupDir, filename);

  logger.info({ filePath }, 'Starting database backup...');

  // Dump tables into structured JSON backup
  const tables = [
    'admin_users',
    'students',
    'plans',
    'student_plans',
    'meal_windows',
    'fingerprints',
    'meal_log',
    'token_ledger',
    'audit_log',
  ];

  const backupData: Record<string, any[]> = {};

  for (const table of tables) {
    backupData[table] = await db(table).select('*');
  }

  fs.writeFileSync(filePath, JSON.stringify(backupData, null, 2), 'utf-8');
  logger.info({ filePath, records: Object.keys(backupData) }, 'Database backup completed successfully.');

  // Prune old backups older than retention period
  pruneOldBackups(backupDir, env.BACKUP_RETENTION_DAYS);

  return filePath;
}

export function pruneOldBackups(dir: string, retentionDays: number) {
  try {
    const files = fs.readdirSync(dir);
    const now = Date.now();
    const maxAgeMs = retentionDays * 86400000;

    for (const file of files) {
      if (file.startsWith('backup_') && file.endsWith('.json')) {
        const fullPath = path.join(dir, file);
        const stats = fs.statSync(fullPath);
        if (now - stats.mtimeMs > maxAgeMs) {
          fs.unlinkSync(fullPath);
          logger.info({ file }, 'Pruned expired backup file');
        }
      }
    }
  } catch (err) {
    logger.error({ err }, 'Error pruning old backups');
  }
}
