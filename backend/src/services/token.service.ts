import { db } from '../db/connection';
import { NotFoundError, AppError } from '../middlewares/error.middleware';

export async function getStudentLedger(
  studentId: string | number,
  page = 1,
  limit = 20
) {
  const offset = (page - 1) * limit;

  const student = await db('students').where('id', studentId).first();
  if (!student) {
    throw new NotFoundError(`Student with ID ${studentId} not found`);
  }

  const [countRes] = await db('token_ledger')
    .where('student_id', studentId)
    .count('id as total');

  const total = Number(countRes?.total || 0);

  const entries = await db('token_ledger as tl')
    .leftJoin('admin_users as a', 'tl.created_by', 'a.id')
    .leftJoin('meal_log as ml', 'tl.meal_log_id', 'ml.id')
    .leftJoin('meal_windows as mw', 'ml.meal_window_id', 'mw.id')
    .where('tl.student_id', studentId)
    .select(
      'tl.id',
      'tl.student_id',
      'tl.student_plan_id',
      'tl.change_amount',
      'tl.reason',
      'tl.method',
      'tl.note',
      'tl.created_at',
      'a.name as created_by_name',
      'ml.meal_date',
      'mw.name as meal_window_name'
    )
    .orderBy('tl.created_at', 'desc')
    .limit(limit)
    .offset(offset);

  const [balanceRow] = await db('student_balances').where('student_id', studentId);

  return {
    studentId: Number(studentId),
    studentName: student.name,
    studentCode: student.student_code,
    currentBalance: Number(balanceRow?.balance || 0),
    data: entries,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function adjustTokens(params: {
  studentId: string | number;
  amount: number;
  note: string;
  adminId: string | number;
}) {
  return await db.transaction(async (trx) => {
    // 1. Lock student row
    const student = await trx('students')
      .where('id', params.studentId)
      .forUpdate()
      .first();

    if (!student) {
      throw new NotFoundError(`Student with ID ${params.studentId} not found`);
    }

    // 2. Get active plan
    const todayStr = new Date().toISOString().split('T')[0];
    let studentPlan = await trx('student_plans')
      .where('student_id', params.studentId)
      .where('start_date', '<=', todayStr)
      .where('end_date', '>=', todayStr)
      .orderBy('created_at', 'desc')
      .first();

    // Fallback to latest plan if no currently active window
    if (!studentPlan) {
      studentPlan = await trx('student_plans')
        .where('student_id', params.studentId)
        .orderBy('created_at', 'desc')
        .first();
    }

    if (!studentPlan) {
      throw new AppError('Cannot adjust tokens: Student has never purchased any plan', 400, 'NO_PLAN');
    }

    // 3. Check current balance if deducting
    const [balanceRow] = await trx('student_balances').where('student_id', params.studentId);
    const currentBalance = Number(balanceRow?.balance || 0);

    if (params.amount < 0 && currentBalance + params.amount < 0) {
      throw new AppError(
        `Cannot deduct ${Math.abs(params.amount)} tokens. Current balance is only ${currentBalance}.`,
        400,
        'INSUFFICIENT_BALANCE'
      );
    }

    // 4. Insert into token_ledger (append-only)
    const [ledgerId] = await trx('token_ledger').insert({
      student_id: params.studentId,
      student_plan_id: studentPlan.id,
      change_amount: params.amount,
      reason: 'MANUAL_ADJUST',
      method: 'MANUAL',
      note: params.note,
      created_by: params.adminId,
      created_at: new Date(),
    });

    const newBalance = currentBalance + params.amount;

    return {
      ledgerId,
      studentId: params.studentId,
      changeAmount: params.amount,
      previousBalance: currentBalance,
      newBalance,
      note: params.note,
    };
  });
}
