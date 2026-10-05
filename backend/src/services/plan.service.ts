import { db } from '../db/connection';
import { NotFoundError, AppError } from '../middlewares/error.middleware';

export async function listPlans(activeOnly = false) {
  let query = db('plans').select('*').orderBy('id', 'asc');
  if (activeOnly) {
    query = query.where('is_active', true);
  }
  return query;
}

export async function createPlan(data: {
  name: string;
  price_inr: number;
  tokens: number;
  validity_days: number;
  meals_per_day?: number;
}) {
  const [id] = await db('plans').insert({
    name: data.name.trim(),
    price_inr: data.price_inr,
    tokens: data.tokens,
    validity_days: data.validity_days,
    meals_per_day: data.meals_per_day || 2,
    is_active: true,
    created_at: new Date(),
  });

  return db('plans').where('id', id).first();
}

export async function updatePlan(
  id: string | number,
  data: {
    name?: string;
    price_inr?: number;
    tokens?: number;
    validity_days?: number;
    meals_per_day?: number;
    is_active?: boolean;
  }
) {
  const plan = await db('plans').where('id', id).first();
  if (!plan) {
    throw new NotFoundError(`Plan with ID ${id} not found`);
  }

  await db('plans')
    .where('id', id)
    .update({
      ...(data.name && { name: data.name.trim() }),
      ...(data.price_inr !== undefined && { price_inr: data.price_inr }),
      ...(data.tokens !== undefined && { tokens: data.tokens }),
      ...(data.validity_days !== undefined && { validity_days: data.validity_days }),
      ...(data.meals_per_day !== undefined && { meals_per_day: data.meals_per_day }),
      ...(data.is_active !== undefined && { is_active: data.is_active }),
    });

  return db('plans').where('id', id).first();
}

export async function sellPlanToStudent(params: {
  studentId: string | number;
  planId: string | number;
  paymentMode: 'CASH' | 'UPI' | 'OTHER';
  startDate?: string;
  soldBy: string | number;
}) {
  return await db.transaction(async (trx) => {
    // 1. Verify student
    const student = await trx('students')
      .where('id', params.studentId)
      .forUpdate()
      .first();

    if (!student) {
      throw new NotFoundError(`Student with ID ${params.studentId} not found`);
    }

    if (student.status !== 'ACTIVE') {
      throw new AppError('Cannot sell plan to an inactive student', 400, 'INACTIVE_STUDENT');
    }

    // 2. Verify plan
    const plan = await trx('plans').where('id', params.planId).first();
    if (!plan) {
      throw new NotFoundError(`Plan with ID ${params.planId} not found`);
    }

    if (!plan.is_active) {
      throw new AppError('This plan is currently deactivated', 400, 'PLAN_INACTIVE');
    }

    // 3. Compute dates
    const start = params.startDate ? new Date(params.startDate) : new Date();
    const end = new Date(start.getTime() + plan.validity_days * 86400000);

    const startDateStr = start.toISOString().split('T')[0];
    const endDateStr = end.toISOString().split('T')[0];

    // 4. Insert student_plans row
    const [studentPlanId] = await trx('student_plans').insert({
      student_id: student.id,
      plan_id: plan.id,
      start_date: startDateStr,
      end_date: endDateStr,
      tokens_total: plan.tokens,
      payment_mode: params.paymentMode,
      amount_paid_inr: plan.price_inr,
      sold_by: params.soldBy,
      created_at: new Date(),
    });

    // 5. Insert PLAN_PURCHASE ledger row
    await trx('token_ledger').insert({
      student_id: student.id,
      student_plan_id: studentPlanId,
      change_amount: plan.tokens,
      reason: 'PLAN_PURCHASE',
      method: 'SYSTEM',
      note: `Plan purchased: ${plan.name} (${plan.tokens} tokens)`,
      created_by: params.soldBy,
      created_at: new Date(),
    });

    // 6. Get updated balance
    const [balanceRow] = await trx('student_balances').where('student_id', student.id);

    return {
      studentPlanId,
      studentId: student.id,
      planName: plan.name,
      startDate: startDateStr,
      endDate: endDateStr,
      tokensAdded: plan.tokens,
      amountPaid: plan.price_inr,
      paymentMode: params.paymentMode,
      currentBalance: Number(balanceRow?.balance || plan.tokens),
    };
  });
}
