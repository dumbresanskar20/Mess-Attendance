import { Router, Request, Response, NextFunction } from 'express';
import { db } from '../db/connection';
import { authenticateJWT } from '../middlewares/auth.middleware';
import { getCurrentISTDateString, getCurrentISTTimeString, isTimeInRange } from '../utils/time';

const router = Router();

router.use(authenticateJWT);

// GET /api/dashboard/today
router.get('/today', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const todayStr = getCurrentISTDateString();
    const currentTime = getCurrentISTTimeString();

    // Find current or next meal window
    const windows = await db('meal_windows').where('is_active', true);
    let activeWindow = windows.find((w) => isTimeInRange(currentTime, w.start_time, w.end_time));
    if (!activeWindow) {
      activeWindow = windows[0] || { id: 1, name: 'Lunch' };
    }

    // 1. Total active students
    const [activeStudentsRes] = await db('students')
      .where('status', 'ACTIVE')
      .count('id as total');
    const totalActiveStudents = Number(activeStudentsRes?.total || 0);

    // 2. Served in current window today
    const [servedRes] = await db('meal_log')
      .where({
        meal_date: todayStr,
        meal_window_id: activeWindow.id,
        result: 'APPROVED',
      })
      .count('id as total');
    const servedCount = Number(servedRes?.total || 0);

    // 3. Dinner expected (active plan holders today)
    const [expectedRes] = await db('student_plans as sp')
      .join('students as s', 'sp.student_id', 's.id')
      .where('s.status', 'ACTIVE')
      .where('sp.start_date', '<=', todayStr)
      .where('sp.end_date', '>=', todayStr)
      .countDistinct('sp.student_id as total');
    const dinnerExpected = Number(expectedRes?.total || totalActiveStudents);

    // 4. Revenue today (sum of amount_paid_inr for plans sold today)
    const [revenueRes] = await db('student_plans')
      .whereRaw('DATE(created_at) = ?', [todayStr])
      .sum('amount_paid_inr as total');
    const revenueToday = Number(revenueRes?.total || 0);

    // 5. Manual entries today
    const [totalMealsRes] = await db('meal_log')
      .where({ meal_date: todayStr, result: 'APPROVED' })
      .count('id as total');
    const totalMealsToday = Number(totalMealsRes?.total || 0);

    const [manualRes] = await db('meal_log')
      .where({ meal_date: todayStr, method: 'MANUAL', result: 'APPROVED' })
      .count('id as total');
    const manualCount = Number(manualRes?.total || 0);

    const manualShare = totalMealsToday > 0 ? (manualCount / totalMealsToday) * 100 : 0;

    res.json({
      date: todayStr,
      currentTime,
      activeWindow: {
        id: activeWindow.id,
        name: activeWindow.name,
      },
      metrics: {
        served: {
          count: servedCount,
          total: totalActiveStudents,
          label: `${activeWindow.name} served`,
        },
        expected: {
          count: dinnerExpected,
          label: 'Dinner expected',
        },
        revenue: {
          amount: revenueToday,
          label: 'Revenue today',
        },
        manualEntries: {
          count: manualCount,
          totalMeals: totalMealsToday,
          sharePercent: Math.round(manualShare * 10) / 10,
          isHighAlert: manualShare > 10,
          label: 'Manual entries',
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/dashboard/weekly (Past 7 days meal counts by lunch & dinner)
router.get('/weekly', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const today = new Date();
    const days: any[] = [];

    // Collect dates for the last 7 days
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today.getTime() - i * 86400000);
      const dateStr = d.toISOString().split('T')[0];
      const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
      days.push({ date: dateStr, day: dayName, lunch: 0, dinner: 0 });
    }

    const startDate = days[0].date;
    const endDate = days[days.length - 1].date;

    const meals = await db('meal_log')
      .where('result', 'APPROVED')
      .where('meal_date', '>=', startDate)
      .where('meal_date', '<=', endDate)
      .select('meal_date', 'meal_window_id')
      .count('id as count')
      .groupBy('meal_date', 'meal_window_id');

    for (const row of meals) {
      const targetDay = days.find((d) => d.date === row.meal_date);
      if (targetDay) {
        if (Number(row.meal_window_id) === 1) {
          targetDay.lunch = Number(row.count);
        } else if (Number(row.meal_window_id) === 2) {
          targetDay.dinner = Number(row.count);
        }
      }
    }

    res.json(days);
  } catch (error) {
    next(error);
  }
});

// GET /api/dashboard/live (Last 8 scans)
router.get('/live', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const scans = await db('meal_log as ml')
      .leftJoin('students as s', 'ml.student_id', 's.id')
      .leftJoin('meal_windows as mw', 'ml.meal_window_id', 'mw.id')
      .select(
        'ml.id',
        'ml.created_at',
        'ml.method',
        'ml.result',
        'ml.reject_reason',
        'ml.manual_reason',
        's.name as student_name',
        's.student_code',
        'mw.name as window_name'
      )
      .orderBy('ml.created_at', 'desc')
      .limit(8);

    res.json(scans);
  } catch (error) {
    next(error);
  }
});

// GET /api/dashboard/alerts
router.get('/alerts', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const todayStr = getCurrentISTDateString();
    const inSevenDaysStr = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];

    // Low balance (4 or fewer tokens)
    const lowBalance = await db('student_balances as sb')
      .join('students as s', 'sb.student_id', 's.id')
      .where('sb.status', 'ACTIVE')
      .where('sb.balance', '<=', 4)
      .select('s.id', 's.name', 's.student_code', 'sb.balance as tokens_left')
      .orderBy('sb.balance', 'asc')
      .limit(10);

    // Plans expiring this week
    const expiringPlans = await db('student_plans as sp')
      .join('students as s', 'sp.student_id', 's.id')
      .join('plans as p', 'sp.plan_id', 'p.id')
      .where('s.status', 'ACTIVE')
      .where('sp.end_date', '>=', todayStr)
      .where('sp.end_date', '<=', inSevenDaysStr)
      .select(
        's.id as student_id',
        's.name as student_name',
        's.student_code',
        'p.name as plan_name',
        'sp.end_date'
      )
      .orderBy('sp.end_date', 'asc')
      .limit(10);

    res.json({
      lowBalance: lowBalance.map((item) => ({
        ...item,
        tokens_left: Number(item.tokens_left),
      })),
      expiringPlans,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
