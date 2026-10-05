export type AdminRole = 'OWNER' | 'COUNTER';

export interface AdminUser {
  id: number;
  name: string;
  email: string;
  role: AdminRole;
  is_active: boolean;
  created_at: string;
}

export interface Student {
  id: number;
  student_code: string;
  name: string;
  phone: string;
  photo_path: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  consent_given_at: string | null;
  tokens_left: number;
  finger_count: number;
  active_plan?: string | null;
  plan_start_date?: string | null;
  plan_end_date?: string | null;
  created_at: string;
}

export interface Fingerprint {
  id: number;
  student_id: number;
  finger_label: string;
  device_user_id: string | null;
  is_active: boolean;
  enrolled_at: string;
  purged_at: string | null;
  enrolled_by_name?: string;
}

export interface Plan {
  id: number;
  name: string;
  price_inr: number;
  tokens: number;
  validity_days: number;
  meals_per_day: number;
  is_active: boolean;
  created_at: string;
}

export type ManualReason =
  | 'FINGER_NOT_READING'
  | 'WET_OR_OILY_FINGER'
  | 'DEVICE_DOWN'
  | 'INJURY'
  | 'OTHER';

export interface MealLogItem {
  id: number;
  meal_date: string;
  method: 'FINGERPRINT' | 'MANUAL';
  result: 'APPROVED' | 'REJECTED';
  reject_reason: string | null;
  manual_reason: string | null;
  device_id: string | null;
  created_at: string;
  student_id: number | null;
  student_code?: string;
  student_name?: string;
  photo_path?: string | null;
  meal_window_name?: string;
  window_name?: string;
  marked_by_name?: string;
}

export interface TokenLedgerItem {
  id: number;
  student_id: number;
  student_plan_id: number;
  change_amount: number;
  reason: 'PLAN_PURCHASE' | 'MEAL' | 'MANUAL_ADJUST' | 'EXPIRY' | 'REFUND';
  method: 'FINGERPRINT' | 'MANUAL' | 'SYSTEM';
  note: string | null;
  created_at: string;
  created_by_name: string | null;
  meal_date: string | null;
  meal_window_name: string | null;
}

export interface ScanOutcome {
  result: 'APPROVED' | 'REJECTED';
  rejectReason?: string | null;
  message: string;
  mealLogId?: number | string;
  method: 'FINGERPRINT' | 'MANUAL';
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

export interface DashboardMetrics {
  date: string;
  currentTime: string;
  activeWindow: {
    id: number;
    name: string;
  };
  metrics: {
    served: {
      count: number;
      total: number;
      label: string;
    };
    expected: {
      count: number;
      label: string;
    };
    revenue: {
      amount: number;
      label: string;
    };
    manualEntries: {
      count: number;
      totalMeals: number;
      sharePercent: number;
      isHighAlert: boolean;
      label: string;
    };
  };
}

export interface WeeklyChartData {
  date: string;
  day: string;
  lunch: number;
  dinner: number;
}

export interface DashboardAlerts {
  lowBalance: Array<{
    id: number;
    name: string;
    student_code: string;
    tokens_left: number;
  }>;
  expiringPlans: Array<{
    student_id: number;
    student_name: string;
    student_code: string;
    plan_name: string;
    end_date: string;
  }>;
}

export interface DeviceStatus {
  connected: boolean;
  driver: string;
  ip?: string;
  userCount?: number;
  templateCount?: number;
  lastSeen?: string;
  error?: string | null;
}
