export type AdminRole = 'OWNER' | 'COUNTER';

export interface AdminUser {
  id: string | number;
  name: string;
  email: string;
  password_hash: string;
  role: AdminRole;
  is_active: boolean;
  must_change_password?: boolean;
  failed_login_attempts?: number;
  locked_until?: string | Date | null;
  created_at: string | Date;
}

export type StudentStatus = 'ACTIVE' | 'INACTIVE';

export interface Student {
  id: string | number;
  student_code: string;
  name: string;
  phone: string;
  photo_path: string | null;
  status: StudentStatus;
  consent_given_at: string | Date | null;
  created_at: string | Date;
  updated_at: string | Date;
}

export interface Fingerprint {
  id: string | number;
  student_id: string | number;
  finger_label: string;
  template_encrypted?: Buffer;
  iv?: string;
  auth_tag?: string;
  device_user_id: string | null;
  is_active: boolean;
  enrolled_by: string | number;
  enrolled_at: string | Date;
  purged_at: string | Date | null;
}

export interface Plan {
  id: string | number;
  name: string;
  price_inr: number;
  tokens: number;
  validity_days: number;
  meals_per_day: number;
  is_active: boolean;
  created_at: string | Date;
}

export type PaymentMode = 'CASH' | 'UPI' | 'OTHER';

export interface StudentPlan {
  id: string | number;
  student_id: string | number;
  plan_id: string | number;
  start_date: string;
  end_date: string;
  tokens_total: number;
  payment_mode: PaymentMode;
  amount_paid_inr: number;
  sold_by: string | number;
  created_at: string | Date;
}

export interface MealWindow {
  id: string | number;
  name: string;
  start_time: string;
  end_time: string;
  is_active: boolean;
  created_at: string | Date;
}

export type LedgerReason = 'PLAN_PURCHASE' | 'MEAL' | 'MANUAL_ADJUST' | 'EXPIRY' | 'REFUND';
export type LedgerMethod = 'FINGERPRINT' | 'MANUAL' | 'SYSTEM';

export interface TokenLedgerEntry {
  id: string | number;
  student_id: string | number;
  student_plan_id: string | number;
  change_amount: number;
  reason: LedgerReason;
  method: LedgerMethod;
  meal_log_id: string | number | null;
  note: string | null;
  created_by: string | number | null;
  created_at: string | Date;
}

export type MealMethod = 'FINGERPRINT' | 'MANUAL';
export type MealResult = 'APPROVED' | 'REJECTED';
export type RejectReason =
  | 'NO_MATCH'
  | 'PLAN_EXPIRED'
  | 'NO_BALANCE'
  | 'OUTSIDE_WINDOW'
  | 'ALREADY_ATE'
  | 'INACTIVE_STUDENT';

export type ManualReason =
  | 'FINGER_NOT_READING'
  | 'WET_OR_OILY_FINGER'
  | 'DEVICE_DOWN'
  | 'INJURY'
  | 'OTHER';

export interface MealLogEntry {
  id: string | number;
  event_id?: string | null;
  student_id: string | number | null;
  meal_window_id: string | number;
  meal_date: string;
  method: MealMethod;
  fingerprint_id: string | number | null;
  device_id: string | null;
  result: MealResult;
  reject_reason: RejectReason | null;
  marked_by: string | number | null;
  manual_reason: ManualReason | null;
  created_at: string | Date;
}

export interface Device {
  id: string | number;
  device_id: string;
  name: string;
  secret_hash: string;
  is_active: boolean;
  last_heartbeat_at: string | Date | null;
  created_at: string | Date;
  updated_at: string | Date;
}

export interface AuditLogEntry {
  id: string | number;
  admin_id: string | number;
  action: string;
  target_type: string;
  target_id: string | null;
  detail: any;
  ip: string | null;
  created_at: string | Date;
}

export interface AuthUserPayload {
  id: number;
  email: string;
  name: string;
  role: AdminRole;
  mustChangePassword?: boolean;
}

