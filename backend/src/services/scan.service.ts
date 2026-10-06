import { Knex } from 'knex';
import { db } from '../db/connection';
import { getCurrentISTDateString, getCurrentISTTimeString, isTimeInRange } from '../utils/time';
import { RejectReason, MealResult, MealMethod, ManualReason } from '../types';
import { emitScanResult } from '../socket';
import { logger } from '../utils/logger';

export interface ScanInput {
  deviceUserId?: string;
  fingerprintId?: string | number;
  studentId?: string | number;
  deviceId?: string;
  simulatedWindowId?: number; // Allowed in dev/test for simulating specific windows
}

export interface ManualMealInput {
  studentId: string | number;
  manualReason: ManualReason;
  note?: string;
  adminId: string | number;
  simulatedWindowId?: number;
}

export interface ScanResultOutput {
  result: MealResult;
  rejectReason?: RejectReason | null;
  message: string;
  mealLogId?: number | string;
  method: MealMethod;
  student?: {
    id: number | string;
    studentCode: string;
    name: string;
    photoPath: string | null;
    planName: string;
    tokensLeft: number;
    planEndDate: string;
  };
  timestamp: string;
}

/**
 * Finds the currently active meal window based on IST time.
 */
export async function getActiveMealWindow(
  trx: Knex,
  simulatedWindowId?: number
): Promise<{ id: number; name: string } | null> {
  if (simulatedWindowId !== undefined && simulatedWindowId !== null) {
    if (simulatedWindowId <= 0) return null;
    const win = await trx('meal_windows')
      .where({ id: simulatedWindowId, is_active: true })
      .first();
    return win ? { id: Number(win.id), name: win.name } : null;
  }

  const currentTime = getCurrentISTTimeString();
  const windows = await trx('meal_windows').where('is_active', true);

  for (const win of windows) {
    if (isTimeInRange(currentTime, win.start_time, win.end_time)) {
      return { id: Number(win.id), name: win.name };
    }
  }

  return null;
}

/**
 * Converts technical rejection reasons to human-friendly text for the counter display.
 */
export function formatRejectMessage(reason: RejectReason, details?: any): string {
  switch (reason) {
    case 'NO_MATCH':
      return 'Fingerprint not recognised. Please try again or mark manually.';
    case 'INACTIVE_STUDENT':
      return 'Student membership is deactivated.';
    case 'OUTSIDE_WINDOW':
      return 'Mess counter is currently closed. No meal window is active.';
    case 'ALREADY_ATE':
      return 'Already ate for this meal window today.';
    case 'PLAN_EXPIRED':
      return `Meal plan has expired on ${details?.endDate || 'date'}. Please renew.`;
    case 'NO_BALANCE':
      return 'No meal tokens remaining. Please recharge.';
    default:
      return 'Scan rejected.';
  }
}

/**
 * Executes the unified scan meal verification in a single atomic database transaction.
 */
export async function processScan(input: ScanInput): Promise<ScanResultOutput> {
  const todayStr = getCurrentISTDateString();
  const deviceId = input.deviceId || 'DEV-COUNTER-01';

  return await db.transaction(async (trx) => {
    // 1. Resolve Meal Window
    const activeWindow = await getActiveMealWindow(trx, input.simulatedWindowId);
    const fallbackWindow = activeWindow || (await trx('meal_windows').first()) || { id: 1, name: 'General' };

    // 2. Resolve Student & Fingerprint
    let student: any = null;
    let fingerprint: any = null;

    if (input.deviceUserId) {
      fingerprint = await trx('fingerprints')
        .where({ device_user_id: input.deviceUserId, is_active: true })
        .first();
      if (fingerprint) {
        student = await trx('students').where('id', fingerprint.student_id).first();
      }
    } else if (input.fingerprintId) {
      fingerprint = await trx('fingerprints')
        .where({ id: input.fingerprintId, is_active: true })
        .first();
      if (fingerprint) {
        student = await trx('students').where('id', fingerprint.student_id).first();
      }
    } else if (input.studentId) {
      student = await trx('students').where('id', input.studentId).first();
      if (student) {
        fingerprint = await trx('fingerprints')
          .where({ student_id: student.id, is_active: true })
          .first();
      }
    }

    // Step 1: No match found
    if (!student) {
      const [mealLogId] = await trx('meal_log').insert({
        student_id: null,
        meal_window_id: fallbackWindow.id,
        meal_date: todayStr,
        method: 'FINGERPRINT',
        fingerprint_id: null,
        device_id: deviceId,
        result: 'REJECTED',
        reject_reason: 'NO_MATCH',
        created_at: new Date(),
      });

      const outcome: ScanResultOutput = {
        result: 'REJECTED',
        rejectReason: 'NO_MATCH',
        message: formatRejectMessage('NO_MATCH'),
        mealLogId,
        method: 'FINGERPRINT',
        timestamp: new Date().toISOString(),
      };

      emitScanResult(outcome);
      return outcome;
    }

    // Lock the student row for update
    await trx('students').where('id', student.id).forUpdate();

    // Step 2: Student is inactive
    if (student.status !== 'ACTIVE') {
      const [mealLogId] = await trx('meal_log').insert({
        student_id: student.id,
        meal_window_id: fallbackWindow.id,
        meal_date: todayStr,
        method: 'FINGERPRINT',
        fingerprint_id: fingerprint?.id || null,
        device_id: deviceId,
        result: 'REJECTED',
        reject_reason: 'INACTIVE_STUDENT',
        created_at: new Date(),
      });

      const outcome: ScanResultOutput = {
        result: 'REJECTED',
        rejectReason: 'INACTIVE_STUDENT',
        message: formatRejectMessage('INACTIVE_STUDENT'),
        mealLogId,
        method: 'FINGERPRINT',
        student: {
          id: student.id,
          studentCode: student.student_code,
          name: student.name,
          photoPath: student.photo_path,
          planName: 'N/A',
          tokensLeft: 0,
          planEndDate: 'N/A',
        },
        timestamp: new Date().toISOString(),
      };

      emitScanResult(outcome);
      return outcome;
    }

    // Step 3: Outside active meal window
    if (!activeWindow) {
      const [mealLogId] = await trx('meal_log').insert({
        student_id: student.id,
        meal_window_id: fallbackWindow.id,
        meal_date: todayStr,
        method: 'FINGERPRINT',
        fingerprint_id: fingerprint?.id || null,
        device_id: deviceId,
        result: 'REJECTED',
        reject_reason: 'OUTSIDE_WINDOW',
        created_at: new Date(),
      });

      const outcome: ScanResultOutput = {
        result: 'REJECTED',
        rejectReason: 'OUTSIDE_WINDOW',
        message: formatRejectMessage('OUTSIDE_WINDOW'),
        mealLogId,
        method: 'FINGERPRINT',
        student: {
          id: student.id,
          studentCode: student.student_code,
          name: student.name,
          photoPath: student.photo_path,
          planName: 'N/A',
          tokensLeft: 0,
          planEndDate: 'N/A',
        },
        timestamp: new Date().toISOString(),
      };

      emitScanResult(outcome);
      return outcome;
    }

    // Step 4 & 5: Check if student already ate in this window today OR repeat scan in 2 min
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);

    const recentApprovedMeal = await trx('meal_log')
      .where({
        student_id: student.id,
        meal_window_id: activeWindow.id,
        meal_date: todayStr,
        result: 'APPROVED',
      })
      .orWhere((builder) => {
        builder
          .where('student_id', student.id)
          .where('result', 'APPROVED')
          .where('created_at', '>=', twoMinutesAgo);
      })
      .first();

    if (recentApprovedMeal) {
      const [mealLogId] = await trx('meal_log').insert({
        student_id: student.id,
        meal_window_id: activeWindow.id,
        meal_date: todayStr,
        method: 'FINGERPRINT',
        fingerprint_id: fingerprint?.id || null,
        device_id: deviceId,
        result: 'REJECTED',
        reject_reason: 'ALREADY_ATE',
        created_at: new Date(),
      });

      const outcome: ScanResultOutput = {
        result: 'REJECTED',
        rejectReason: 'ALREADY_ATE',
        message: formatRejectMessage('ALREADY_ATE'),
        mealLogId,
        method: 'FINGERPRINT',
        student: {
          id: student.id,
          studentCode: student.student_code,
          name: student.name,
          photoPath: student.photo_path,
          planName: 'Active Plan',
          tokensLeft: 0,
          planEndDate: todayStr,
        },
        timestamp: new Date().toISOString(),
      };

      emitScanResult(outcome);
      return outcome;
    }

    // Step 6: Active plan check
    const activeStudentPlan = await trx('student_plans as sp')
      .join('plans as p', 'sp.plan_id', 'p.id')
      .where('sp.student_id', student.id)
      .where('sp.start_date', '<=', todayStr)
      .where('sp.end_date', '>=', todayStr)
      .select('sp.*', 'p.name as plan_name')
      .orderBy('sp.created_at', 'desc')
      .forUpdate()
      .first();

    if (!activeStudentPlan) {
      // Find latest expired plan if available for helpful message
      const latestPlan = await trx('student_plans')
        .where('student_id', student.id)
        .orderBy('end_date', 'desc')
        .first();

      const [mealLogId] = await trx('meal_log').insert({
        student_id: student.id,
        meal_window_id: activeWindow.id,
        meal_date: todayStr,
        method: 'FINGERPRINT',
        fingerprint_id: fingerprint?.id || null,
        device_id: deviceId,
        result: 'REJECTED',
        reject_reason: 'PLAN_EXPIRED',
        created_at: new Date(),
      });

      const outcome: ScanResultOutput = {
        result: 'REJECTED',
        rejectReason: 'PLAN_EXPIRED',
        message: formatRejectMessage('PLAN_EXPIRED', { endDate: latestPlan?.end_date }),
        mealLogId,
        method: 'FINGERPRINT',
        student: {
          id: student.id,
          studentCode: student.student_code,
          name: student.name,
          photoPath: student.photo_path,
          planName: 'Expired',
          tokensLeft: 0,
          planEndDate: latestPlan?.end_date || 'N/A',
        },
        timestamp: new Date().toISOString(),
      };

      emitScanResult(outcome);
      return outcome;
    }

    // Step 7: Balance check
    const [balanceRow] = await trx('student_balances').where('student_id', student.id);
    const balance = Number(balanceRow?.balance || 0);

    if (balance <= 0) {
      const [mealLogId] = await trx('meal_log').insert({
        student_id: student.id,
        meal_window_id: activeWindow.id,
        meal_date: todayStr,
        method: 'FINGERPRINT',
        fingerprint_id: fingerprint?.id || null,
        device_id: deviceId,
        result: 'REJECTED',
        reject_reason: 'NO_BALANCE',
        created_at: new Date(),
      });

      const outcome: ScanResultOutput = {
        result: 'REJECTED',
        rejectReason: 'NO_BALANCE',
        message: formatRejectMessage('NO_BALANCE'),
        mealLogId,
        method: 'FINGERPRINT',
        student: {
          id: student.id,
          studentCode: student.student_code,
          name: student.name,
          photoPath: student.photo_path,
          planName: activeStudentPlan.plan_name,
          tokensLeft: 0,
          planEndDate: activeStudentPlan.end_date,
        },
        timestamp: new Date().toISOString(),
      };

      emitScanResult(outcome);
      return outcome;
    }

    // Step 8 & 9: Insert APPROVED meal_log & token_ledger deduction
    const [mealLogId] = await trx('meal_log').insert({
      student_id: student.id,
      meal_window_id: activeWindow.id,
      meal_date: todayStr,
      method: 'FINGERPRINT',
      fingerprint_id: fingerprint?.id || null,
      device_id: deviceId,
      result: 'APPROVED',
      created_at: new Date(),
    });

    await trx('token_ledger').insert({
      student_id: student.id,
      student_plan_id: activeStudentPlan.id,
      change_amount: -1,
      reason: 'MEAL',
      method: 'FINGERPRINT',
      meal_log_id: mealLogId,
      note: `${activeWindow.name} meal verified by fingerprint scan`,
      created_at: new Date(),
    });

    const newTokensLeft = balance - 1;

    const outcome: ScanResultOutput = {
      result: 'APPROVED',
      message: `Meal approved for ${student.name}`,
      mealLogId,
      method: 'FINGERPRINT',
      student: {
        id: student.id,
        studentCode: student.student_code,
        name: student.name,
        photoPath: student.photo_path,
        planName: activeStudentPlan.plan_name,
        tokensLeft: newTokensLeft,
        planEndDate: activeStudentPlan.end_date,
      },
      timestamp: new Date().toISOString(),
    };

    emitScanResult(outcome);
    return outcome;
  }).catch((err) => {
    if (err.code === 'ER_DUP_ENTRY' || err.message?.includes('Duplicate entry')) {
      const outcome: ScanResultOutput = {
        result: 'REJECTED',
        rejectReason: 'ALREADY_ATE',
        message: formatRejectMessage('ALREADY_ATE'),
        method: 'FINGERPRINT',
        timestamp: new Date().toISOString(),
      };
      emitScanResult(outcome);
      return outcome;
    }
    throw err;
  });
}

/**
 * Executes a manual meal marking with the exact same business rules as a scan.
 */
export async function processManualMeal(input: ManualMealInput): Promise<ScanResultOutput> {
  const todayStr = getCurrentISTDateString();

  return await db.transaction(async (trx) => {
    // 1. Resolve Meal Window
    const activeWindow = await getActiveMealWindow(trx, input.simulatedWindowId);
    const fallbackWindow = (await trx('meal_windows').where('is_active', true).first()) || { id: 1, name: 'General' };

    // 2. Resolve Student
    const student = await trx('students')
      .where('id', input.studentId)
      .forUpdate()
      .first();

    if (!student) {
      const outcome: ScanResultOutput = {
        result: 'REJECTED',
        rejectReason: 'NO_MATCH',
        message: 'Student not found',
        method: 'MANUAL',
        timestamp: new Date().toISOString(),
      };
      emitScanResult(outcome);
      return outcome;
    }

    // Active check
    if (student.status !== 'ACTIVE') {
      const [mealLogId] = await trx('meal_log').insert({
        student_id: student.id,
        meal_window_id: fallbackWindow.id,
        meal_date: todayStr,
        method: 'MANUAL',
        result: 'REJECTED',
        reject_reason: 'INACTIVE_STUDENT',
        marked_by: input.adminId,
        manual_reason: input.manualReason,
        created_at: new Date(),
      });

      const outcome: ScanResultOutput = {
        result: 'REJECTED',
        rejectReason: 'INACTIVE_STUDENT',
        message: formatRejectMessage('INACTIVE_STUDENT'),
        mealLogId,
        method: 'MANUAL',
        student: {
          id: student.id,
          studentCode: student.student_code,
          name: student.name,
          photoPath: student.photo_path,
          planName: 'N/A',
          tokensLeft: 0,
          planEndDate: 'N/A',
        },
        timestamp: new Date().toISOString(),
      };
      emitScanResult(outcome);
      return outcome;
    }

    // Active Window Check: only reject if an explicit simulated window was given and not found
    if (input.simulatedWindowId !== undefined && !activeWindow) {
      const [mealLogId] = await trx('meal_log').insert({
        student_id: student.id,
        meal_window_id: fallbackWindow.id,
        meal_date: todayStr,
        method: 'MANUAL',
        result: 'REJECTED',
        reject_reason: 'OUTSIDE_WINDOW',
        marked_by: input.adminId,
        manual_reason: input.manualReason,
        created_at: new Date(),
      });

      const outcome: ScanResultOutput = {
        result: 'REJECTED',
        rejectReason: 'OUTSIDE_WINDOW',
        message: formatRejectMessage('OUTSIDE_WINDOW'),
        mealLogId,
        method: 'MANUAL',
        student: {
          id: student.id,
          studentCode: student.student_code,
          name: student.name,
          photoPath: student.photo_path,
          planName: 'N/A',
          tokensLeft: 0,
          planEndDate: 'N/A',
        },
        timestamp: new Date().toISOString(),
      };
      emitScanResult(outcome);
      return outcome;
    }

    const targetWindow = activeWindow || fallbackWindow;

    // Already Ate Check
    const recentApproved = await trx('meal_log')
      .where({
        student_id: student.id,
        meal_window_id: targetWindow.id,
        meal_date: todayStr,
        result: 'APPROVED',
      })
      .first();

    if (recentApproved) {
      const [mealLogId] = await trx('meal_log').insert({
        student_id: student.id,
        meal_window_id: targetWindow.id,
        meal_date: todayStr,
        method: 'MANUAL',
        result: 'REJECTED',
        reject_reason: 'ALREADY_ATE',
        marked_by: input.adminId,
        manual_reason: input.manualReason,
        created_at: new Date(),
      });

      const outcome: ScanResultOutput = {
        result: 'REJECTED',
        rejectReason: 'ALREADY_ATE',
        message: formatRejectMessage('ALREADY_ATE'),
        mealLogId,
        method: 'MANUAL',
        student: {
          id: student.id,
          studentCode: student.student_code,
          name: student.name,
          photoPath: student.photo_path,
          planName: 'Active Plan',
          tokensLeft: 0,
          planEndDate: todayStr,
        },
        timestamp: new Date().toISOString(),
      };
      emitScanResult(outcome);
      return outcome;
    }

    // Plan Expired Check
    const activeStudentPlan = await trx('student_plans as sp')
      .join('plans as p', 'sp.plan_id', 'p.id')
      .where('sp.student_id', student.id)
      .where('sp.start_date', '<=', todayStr)
      .where('sp.end_date', '>=', todayStr)
      .select('sp.*', 'p.name as plan_name')
      .orderBy('sp.created_at', 'desc')
      .forUpdate()
      .first();

    if (!activeStudentPlan) {
      const [mealLogId] = await trx('meal_log').insert({
        student_id: student.id,
        meal_window_id: targetWindow.id,
        meal_date: todayStr,
        method: 'MANUAL',
        result: 'REJECTED',
        reject_reason: 'PLAN_EXPIRED',
        marked_by: input.adminId,
        manual_reason: input.manualReason,
        created_at: new Date(),
      });

      const outcome: ScanResultOutput = {
        result: 'REJECTED',
        rejectReason: 'PLAN_EXPIRED',
        message: formatRejectMessage('PLAN_EXPIRED'),
        mealLogId,
        method: 'MANUAL',
        student: {
          id: student.id,
          studentCode: student.student_code,
          name: student.name,
          photoPath: student.photo_path,
          planName: 'Expired',
          tokensLeft: 0,
          planEndDate: 'N/A',
        },
        timestamp: new Date().toISOString(),
      };
      emitScanResult(outcome);
      return outcome;
    }

    // Balance Check
    const [balanceRow] = await trx('student_balances').where('student_id', student.id);
    const balance = Number(balanceRow?.balance || 0);

    if (balance <= 0) {
      const [mealLogId] = await trx('meal_log').insert({
        student_id: student.id,
        meal_window_id: targetWindow.id,
        meal_date: todayStr,
        method: 'MANUAL',
        result: 'REJECTED',
        reject_reason: 'NO_BALANCE',
        marked_by: input.adminId,
        manual_reason: input.manualReason,
        created_at: new Date(),
      });

      const outcome: ScanResultOutput = {
        result: 'REJECTED',
        rejectReason: 'NO_BALANCE',
        message: formatRejectMessage('NO_BALANCE'),
        mealLogId,
        method: 'MANUAL',
        student: {
          id: student.id,
          studentCode: student.student_code,
          name: student.name,
          photoPath: student.photo_path,
          planName: activeStudentPlan.plan_name,
          tokensLeft: 0,
          planEndDate: activeStudentPlan.end_date,
        },
        timestamp: new Date().toISOString(),
      };
      emitScanResult(outcome);
      return outcome;
    }

    // Approved Manual Meal
    const [mealLogId] = await trx('meal_log').insert({
      student_id: student.id,
      meal_window_id: targetWindow.id,
      meal_date: todayStr,
      method: 'MANUAL',
      result: 'APPROVED',
      marked_by: input.adminId,
      manual_reason: input.manualReason,
      created_at: new Date(),
    });

    const combinedNote = input.note
      ? `Manual marking: ${input.manualReason} - ${input.note}`
      : `Manual marking: ${input.manualReason}`;

    await trx('token_ledger').insert({
      student_id: student.id,
      student_plan_id: activeStudentPlan.id,
      change_amount: -1,
      reason: 'MEAL',
      method: 'MANUAL',
      meal_log_id: mealLogId,
      note: combinedNote,
      created_by: input.adminId,
      created_at: new Date(),
    });

    const newTokensLeft = balance - 1;

    const outcome: ScanResultOutput = {
      result: 'APPROVED',
      message: `Manual meal marked for ${student.name}`,
      mealLogId,
      method: 'MANUAL',
      student: {
        id: student.id,
        studentCode: student.student_code,
        name: student.name,
        photoPath: student.photo_path,
        planName: activeStudentPlan.plan_name,
        tokensLeft: newTokensLeft,
        planEndDate: activeStudentPlan.end_date,
      },
      timestamp: new Date().toISOString(),
    };

    emitScanResult(outcome);
    return outcome;
  });
}

/**
 * Filterable meals query for the dashboard and meal log page.
 */
export async function listMeals(params: {
  startDate?: string;
  endDate?: string;
  windowId?: number;
  studentId?: number;
  method?: MealMethod;
  result?: MealResult;
  page?: number;
  limit?: number;
}) {
  const page = Math.max(1, params.page || 1);
  const limit = Math.max(1, Math.min(100, params.limit || 20));
  const offset = (page - 1) * limit;

  let query = db('meal_log as ml')
    .leftJoin('students as s', 'ml.student_id', 's.id')
    .leftJoin('meal_windows as mw', 'ml.meal_window_id', 'mw.id')
    .leftJoin('admin_users as a', 'ml.marked_by', 'a.id')
    .select(
      'ml.id',
      'ml.meal_date',
      'ml.method',
      'ml.result',
      'ml.reject_reason',
      'ml.manual_reason',
      'ml.device_id',
      'ml.created_at',
      's.id as student_id',
      's.student_code',
      's.name as student_name',
      's.photo_path',
      'mw.name as meal_window_name',
      'a.name as marked_by_name'
    );

  let countQuery = db('meal_log');

  if (params.startDate) {
    query = query.where('ml.meal_date', '>=', params.startDate);
    countQuery = countQuery.where('meal_date', '>=', params.startDate);
  }
  if (params.endDate) {
    query = query.where('ml.meal_date', '<=', params.endDate);
    countQuery = countQuery.where('meal_date', '<=', params.endDate);
  }
  if (params.windowId) {
    query = query.where('ml.meal_window_id', params.windowId);
    countQuery = countQuery.where('meal_window_id', params.windowId);
  }
  if (params.studentId) {
    query = query.where('ml.student_id', params.studentId);
    countQuery = countQuery.where('student_id', params.studentId);
  }
  if (params.method) {
    query = query.where('ml.method', params.method);
    countQuery = countQuery.where('method', params.method);
  }
  if (params.result) {
    query = query.where('ml.result', params.result);
    countQuery = countQuery.where('result', params.result);
  }

  const [countRes] = await countQuery.count('id as total');
  const total = Number(countRes?.total || 0);

  const data = await query
    .orderBy('ml.created_at', 'desc')
    .limit(limit)
    .offset(offset);

  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}
