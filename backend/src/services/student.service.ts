import { db } from '../db/connection';
import { NotFoundError, ConflictError } from '../middlewares/error.middleware';

export interface StudentFilterParams {
  search?: string;
  status?: 'ACTIVE' | 'INACTIVE';
  filter?: 'all' | 'expiring' | 'low_balance' | 'few_fingers';
  page?: number;
  limit?: number;
}

export async function listStudents(params: StudentFilterParams) {
  const page = Math.max(1, params.page || 1);
  const limit = Math.max(1, Math.min(100, params.limit || 15));
  const offset = (page - 1) * limit;

  const todayStr = new Date().toISOString().split('T')[0];
  const inSevenDaysStr = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];

  // Base query joining students with balance view, fingerprint count, and active plan
  let query = db('students as s')
    .leftJoin('student_balances as sb', 's.id', 'sb.student_id')
    .leftJoin(
      db('fingerprints')
        .select('student_id')
        .count('id as finger_count')
        .where('is_active', true)
        .groupBy('student_id')
        .as('fc'),
      's.id',
      'fc.student_id'
    )
    .leftJoin(
      db('student_plans as sp')
        .join('plans as p', 'sp.plan_id', 'p.id')
        .select(
          'sp.student_id',
          'sp.id as active_plan_id',
          'p.name as plan_name',
          'sp.start_date',
          'sp.end_date',
          'sp.tokens_total'
        )
        .where('sp.start_date', '<=', todayStr)
        .where('sp.end_date', '>=', todayStr)
        .orderBy('sp.created_at', 'desc')
        .as('ap'),
      's.id',
      'ap.student_id'
    )
    .select(
      's.id',
      's.student_code',
      's.name',
      's.phone',
      's.photo_path',
      's.status',
      's.consent_given_at',
      's.created_at',
      db.raw('COALESCE(sb.balance, 0) as tokens_left'),
      db.raw('COALESCE(fc.finger_count, 0) as finger_count'),
      'ap.plan_name as active_plan',
      'ap.start_date as plan_start_date',
      'ap.end_date as plan_end_date'
    );

  // Search filter
  if (params.search) {
    const s = `%${params.search}%`;
    query = query.where((builder) => {
      builder
        .where('s.name', 'like', s)
        .orWhere('s.student_code', 'like', s)
        .orWhere('s.phone', 'like', s);
    });
  }

  // Status filter
  if (params.status) {
    query = query.where('s.status', params.status);
  }

  // Predefined filter tabs
  if (params.filter === 'expiring') {
    query = query
      .whereNotNull('ap.end_date')
      .where('ap.end_date', '>=', todayStr)
      .where('ap.end_date', '<=', inSevenDaysStr);
  } else if (params.filter === 'low_balance') {
    query = query.whereRaw('COALESCE(sb.balance, 0) <= 4');
  } else if (params.filter === 'few_fingers') {
    query = query.whereRaw('COALESCE(fc.finger_count, 0) < 2');
  }

  // Count total matching
  const countQuery = db('students as s')
    .leftJoin('student_balances as sb', 's.id', 'sb.student_id')
    .leftJoin(
      db('fingerprints')
        .select('student_id')
        .count('id as finger_count')
        .where('is_active', true)
        .groupBy('student_id')
        .as('fc'),
      's.id',
      'fc.student_id'
    )
    .leftJoin(
      db('student_plans as sp')
        .select('sp.student_id', 'sp.end_date')
        .where('sp.start_date', '<=', todayStr)
        .where('sp.end_date', '>=', todayStr)
        .as('ap'),
      's.id',
      'ap.student_id'
    );

  if (params.search) {
    const s = `%${params.search}%`;
    countQuery.where((builder) => {
      builder
        .where('s.name', 'like', s)
        .orWhere('s.student_code', 'like', s)
        .orWhere('s.phone', 'like', s);
    });
  }
  if (params.status) {
    countQuery.where('s.status', params.status);
  }
  if (params.filter === 'expiring') {
    countQuery
      .whereNotNull('ap.end_date')
      .where('ap.end_date', '>=', todayStr)
      .where('ap.end_date', '<=', inSevenDaysStr);
  } else if (params.filter === 'low_balance') {
    countQuery.whereRaw('COALESCE(sb.balance, 0) <= 4');
  } else if (params.filter === 'few_fingers') {
    countQuery.whereRaw('COALESCE(fc.finger_count, 0) < 2');
  }

  const [totalResult] = await countQuery.count('s.id as total');
  const total = Number(totalResult?.total || 0);

  const students = await query
    .orderBy('s.created_at', 'desc')
    .limit(limit)
    .offset(offset);

  return {
    data: students.map((s) => ({
      ...s,
      tokens_left: Number(s.tokens_left),
      finger_count: Number(s.finger_count),
    })),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getStudentById(id: string | number) {
  const todayStr = new Date().toISOString().split('T')[0];

  const student = await db('students as s')
    .leftJoin('student_balances as sb', 's.id', 'sb.student_id')
    .where('s.id', id)
    .select(
      's.*',
      db.raw('COALESCE(sb.balance, 0) as tokens_left')
    )
    .first();

  if (!student) {
    throw new NotFoundError(`Student with ID ${id} not found`);
  }

  // Active plan
  const activePlan = await db('student_plans as sp')
    .join('plans as p', 'sp.plan_id', 'p.id')
    .leftJoin('admin_users as a', 'sp.sold_by', 'a.id')
    .where('sp.student_id', id)
    .where('sp.start_date', '<=', todayStr)
    .where('sp.end_date', '>=', todayStr)
    .select(
      'sp.*',
      'p.name as plan_name',
      'p.validity_days',
      'p.meals_per_day',
      'a.name as sold_by_name'
    )
    .orderBy('sp.created_at', 'desc')
    .first();

  // All fingerprints (NEVER return template or key details)
  const fingerprints = await db('fingerprints as f')
    .leftJoin('admin_users as a', 'f.enrolled_by', 'a.id')
    .where('f.student_id', id)
    .select(
      'f.id',
      'f.finger_label',
      'f.device_user_id',
      'f.is_active',
      'f.enrolled_at',
      'f.purged_at',
      'a.name as enrolled_by_name'
    )
    .orderBy('f.enrolled_at', 'desc');

  return {
    ...student,
    tokens_left: Number(student.tokens_left),
    finger_count: fingerprints.filter((f) => f.is_active).length,
    activePlan: activePlan || null,
    fingerprints,
  };
}

export async function createStudent(data: {
  student_code: string;
  name: string;
  phone: string;
  photo_path?: string | null;
  consent_given: boolean;
}) {
  const existing = await db('students')
    .where('student_code', data.student_code.trim())
    .first();

  if (existing) {
    throw new ConflictError(`Student code "${data.student_code}" is already in use`);
  }

  const [id] = await db('students').insert({
    student_code: data.student_code.trim().toUpperCase(),
    name: data.name.trim(),
    phone: data.phone.trim(),
    photo_path: data.photo_path || null,
    status: 'ACTIVE',
    consent_given_at: data.consent_given ? new Date() : null,
    created_at: new Date(),
    updated_at: new Date(),
  });

  return getStudentById(id);
}

export async function updateStudent(
  id: string | number,
  data: {
    name?: string;
    phone?: string;
    photo_path?: string | null;
    status?: 'ACTIVE' | 'INACTIVE';
  }
) {
  const student = await db('students').where('id', id).first();
  if (!student) {
    throw new NotFoundError(`Student with ID ${id} not found`);
  }

  await db('students')
    .where('id', id)
    .update({
      ...(data.name && { name: data.name.trim() }),
      ...(data.phone && { phone: data.phone.trim() }),
      ...(data.photo_path !== undefined && { photo_path: data.photo_path }),
      ...(data.status && { status: data.status }),
      updated_at: new Date(),
    });

  return getStudentById(id);
}

export async function deactivateStudent(id: string | number) {
  const student = await db('students').where('id', id).first();
  if (!student) {
    throw new NotFoundError(`Student with ID ${id} not found`);
  }

  await db.transaction(async (trx) => {
    // 1. Deactivate student
    await trx('students').where('id', id).update({
      status: 'INACTIVE',
      updated_at: new Date(),
    });

    // 2. Deactivate all their fingerprints
    await trx('fingerprints').where('student_id', id).update({
      is_active: false,
    });
  });

  return getStudentById(id);
}
