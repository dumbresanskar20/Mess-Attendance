import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Fingerprint,
  CreditCard,
  History,
  BookOpen,
  AlertTriangle,
  Plus,
  Trash2,
  ShieldAlert,
  ArrowLeft,
  CheckCircle,
  Coins,
  Calendar,
  Phone,
  UserX,
} from 'lucide-react';
import { apiRequest } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { Badge } from '../components/common/Badge';
import { Skeleton } from '../components/common/Skeleton';
import { Modal } from '../components/common/Modal';
import { FingerprintScanModal } from '../components/biometrics/FingerprintScanModal';
import { BiometricCaptureResult } from '../utils/biometrics';
import { Student, Fingerprint as FingerprintType, Plan, MealLogItem, TokenLedgerItem } from '../types';

export const StudentProfilePage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isOwner } = useAuth();

  const [student, setStudent] = useState<any | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [activeTab, setActiveTab] = useState<'plan' | 'fingerprints' | 'meals' | 'ledger'>('plan');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Tab Data States
  const [mealLogs, setMealLogs] = useState<MealLogItem[]>([]);
  const [ledgerEntries, setLedgerEntries] = useState<TokenLedgerItem[]>([]);

  // Modals State
  const [isSellOpen, setIsSellOpen] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<number | string>('');
  const [paymentMode, setPaymentMode] = useState<'CASH' | 'UPI' | 'OTHER'>('UPI');
  const [planStartDate, setPlanStartDate] = useState(new Date().toISOString().split('T')[0]);

  const [isAdjustOpen, setIsAdjustOpen] = useState(false);
  const [adjustAmount, setAdjustAmount] = useState<number>(0);
  const [adjustReason, setAdjustReason] = useState('');
  const [adjustNote, setAdjustNote] = useState('');

  const [isEnrollOpen, setIsEnrollOpen] = useState(false);
  const [enrollFingerLabel, setEnrollFingerLabel] = useState('Right index');

  const [isPurgeConfirmOpen, setIsPurgeConfirmOpen] = useState(false);
  const [fingerToPurge, setFingerToPurge] = useState<FingerprintType | null>(null);

  const fetchStudentData = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await apiRequest(`/students/${id}`);
      setStudent(res);

      const plansRes = await apiRequest<Plan[]>('/plans?active=true');
      setPlans(plansRes);
      if (plansRes.length > 0 && !selectedPlanId) {
        setSelectedPlanId(plansRes[0].id);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load student profile');
    } finally {
      setLoading(false);
    }
  };

  const fetchMeals = async () => {
    if (!id) return;
    try {
      const res = await apiRequest(`/meals?studentId=${id}&limit=50`);
      setMealLogs(res.data);
    } catch (e) {}
  };

  const fetchLedger = async () => {
    if (!id) return;
    try {
      const res = await apiRequest(`/students/${id}/ledger?limit=50`);
      setLedgerEntries(res.data);
    } catch (e) {}
  };

  useEffect(() => {
    fetchStudentData();
  }, [id]);

  useEffect(() => {
    if (activeTab === 'meals') fetchMeals();
    if (activeTab === 'ledger') fetchLedger();
  }, [activeTab]);

  // Sell Plan
  const handleSellPlan = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest(`/students/${id}/plans`, {
        method: 'POST',
        body: JSON.stringify({
          planId: Number(selectedPlanId),
          paymentMode,
          startDate: planStartDate,
        }),
      });
      setIsSellOpen(false);
      fetchStudentData();
      if (activeTab === 'ledger') fetchLedger();
    } catch (err: any) {
      alert(err.message || 'Failed to sell plan');
    }
  };

  // Adjust Tokens (OWNER only)
  const handleAdjustTokens = async (e: React.FormEvent) => {
    e.preventDefault();
    if (adjustAmount === 0 || !adjustReason) return;
    try {
      await apiRequest('/tokens/adjust', {
        method: 'POST',
        body: JSON.stringify({
          studentId: Number(id),
          amount: adjustAmount,
          reason: adjustReason,
          note: adjustNote,
        }),
      });
      setIsAdjustOpen(false);
      setAdjustAmount(0);
      setAdjustReason('');
      setAdjustNote('');
      fetchStudentData();
      if (activeTab === 'ledger') fetchLedger();
    } catch (err: any) {
      alert(err.message || 'Failed to adjust tokens');
    }
  };

  // Enroll Fingerprint
  const handleEnrollFinger = async (biometric: BiometricCaptureResult) => {
    try {
      await apiRequest(`/students/${id}/fingerprints/enroll`, {
        method: 'POST',
        body: JSON.stringify({
          finger_label: biometric.fingerLabel,
          raw_template: biometric.rawTemplate,
          device_user_id: biometric.deviceUserId,
        }),
      });
      setIsEnrollOpen(false);
      fetchStudentData();
    } catch (err: any) {
      alert(err.message || 'Failed to enroll fingerprint');
    }
  };

  // Deactivate Fingerprint
  const handleDeactivateFinger = async (fingerId: number) => {
    if (!window.confirm('Are you sure you want to deactivate this fingerprint?')) return;
    try {
      await apiRequest(`/fingerprints/${fingerId}/deactivate`, { method: 'POST' });
      fetchStudentData();
    } catch (err: any) {
      alert(err.message || 'Failed to deactivate fingerprint');
    }
  };

  // Purge Fingerprint (OWNER only)
  const handlePurgeFinger = async () => {
    if (!fingerToPurge) return;
    try {
      await apiRequest(`/fingerprints/${fingerToPurge.id}/purge`, { method: 'POST' });
      setIsPurgeConfirmOpen(false);
      setFingerToPurge(null);
      fetchStudentData();
    } catch (err: any) {
      alert(err.message || 'Failed to purge biometric template');
    }
  };

  // Deactivate Student
  const handleDeactivateStudent = async () => {
    if (
      !window.confirm(
        'Deactivating this student will also disable all their fingerprints. Their history will remain intact. Proceed?'
      )
    )
      return;
    try {
      await apiRequest(`/students/${id}/deactivate`, { method: 'POST' });
      fetchStudentData();
    } catch (err: any) {
      alert(err.message || 'Failed to deactivate student');
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 max-w-5xl mx-auto">
        <Skeleton className="h-32 w-full rounded-card" />
        <Skeleton className="h-64 w-full rounded-card" />
      </div>
    );
  }

  if (error || !student) {
    return (
      <div className="p-8 text-center space-y-4 max-w-md mx-auto">
        <AlertTriangle className="w-10 h-10 text-danger mx-auto" />
        <h3 className="font-bold text-base">{error || 'Student not found'}</h3>
        <button
          onClick={() => navigate('/students')}
          className="px-4 py-2 bg-accent text-white rounded text-xs font-semibold"
        >
          Back to students
        </button>
      </div>
    );
  }

  const isFewFingers = student.finger_count < 2;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Back Link */}
      <button
        onClick={() => navigate('/students')}
        className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        <span>Back to student directory</span>
      </button>

      {/* Warning Banner if < 2 fingers enrolled */}
      {isFewFingers && (
        <div className="p-3.5 rounded-card bg-warning-subtle text-warning border border-warning-border flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 font-medium">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>
              Student has only {student.finger_count} active fingerprint enrolled. At least 2 fingers are recommended for counter fallback.
            </span>
          </div>
          <button
            onClick={() => setIsEnrollOpen(true)}
            className="px-2.5 py-1 bg-surface-elevated font-semibold rounded border border-warning-border hover:bg-surface transition-colors"
          >
            Enroll 2nd finger
          </button>
        </div>
      )}

      {/* Profile Header Card */}
      <div className="p-6 rounded-card bg-surface-elevated border border-border flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <img
            src={
              student.photo_path ||
              `https://api.dicebear.com/7.x/avataaars/svg?seed=${student.student_code}`
            }
            alt={student.name}
            className="w-16 h-16 rounded-xl border border-border object-cover bg-surface-subtle shadow-xs"
          />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-text">{student.name}</h1>
              <Badge variant={student.status === 'ACTIVE' ? 'success' : 'neutral'}>
                {student.status}
              </Badge>
            </div>
            <div className="flex items-center gap-3 text-xs text-text-muted mt-1">
              <span className="font-mono">{student.student_code}</span>
              <span>&bull;</span>
              <span className="flex items-center gap-1">
                <Phone className="w-3.5 h-3.5" />
                {student.phone}
              </span>
              <span>&bull;</span>
              <span>
                Consent given:{' '}
                {student.consent_given_at
                  ? new Date(student.consent_given_at).toLocaleDateString()
                  : 'Pending'}
              </span>
            </div>
          </div>
        </div>

        {/* Tokens & Balance Pill */}
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-surface-subtle border border-border text-center">
            <span className="text-[10px] text-text-muted uppercase font-bold block">
              Remaining tokens
            </span>
            <span className="text-2xl font-black text-accent">{student.tokens_left}</span>
          </div>

          {student.status === 'ACTIVE' && (
            <button
              onClick={handleDeactivateStudent}
              className="p-2 rounded-lg border border-border hover:bg-danger-subtle text-text-muted hover:text-danger transition-colors"
              title="Deactivate student and all fingerprints"
            >
              <UserX className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Profile Navigation Tabs */}
      <div className="border-b border-border flex items-center gap-6 text-xs font-semibold">
        {[
          { id: 'plan', label: 'Plan & tokens', icon: CreditCard },
          { id: 'fingerprints', label: `Fingerprints (${student.finger_count})`, icon: Fingerprint },
          { id: 'meals', label: 'Meal history', icon: History },
          { id: 'ledger', label: 'Token ledger', icon: BookOpen },
        ].map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`pb-3 flex items-center gap-2 border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-accent text-accent'
                  : 'border-transparent text-text-muted hover:text-text'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab 1: Plan & Tokens */}
      {activeTab === 'plan' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Active Plan Card */}
          <div className="p-5 rounded-card bg-surface-elevated border border-border flex flex-col justify-between">
            <div>
              <span className="text-xs font-semibold text-text-muted uppercase tracking-wider block mb-2">
                Current active plan
              </span>
              {student.activePlan ? (
                <div className="space-y-3">
                  <h3 className="text-lg font-bold text-text">
                    {student.activePlan.plan_name}
                  </h3>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="p-2.5 rounded bg-surface-subtle">
                      <span className="text-[10px] text-text-muted block">Start date</span>
                      <span className="font-semibold">{student.activePlan.start_date}</span>
                    </div>
                    <div className="p-2.5 rounded bg-surface-subtle">
                      <span className="text-[10px] text-text-muted block">End date</span>
                      <span className="font-semibold">{student.activePlan.end_date}</span>
                    </div>
                  </div>
                  <div className="text-xs text-text-muted">
                    Total plan tokens: {student.activePlan.tokens_total} &bull; Mode:{' '}
                    {student.activePlan.payment_mode}
                  </div>
                </div>
              ) : (
                <div className="py-6 text-center text-xs text-text-muted">
                  No active plan covering today. Please renew below.
                </div>
              )}
            </div>

            <div className="pt-4 mt-4 border-t border-border flex items-center gap-3">
              <button
                onClick={() => setIsSellOpen(true)}
                className="flex-1 py-2 px-3 bg-accent hover:bg-accent-hover text-white rounded-lg text-xs font-semibold transition-colors text-center"
              >
                Sell / Renew plan
              </button>
              {isOwner && (
                <button
                  onClick={() => setIsAdjustOpen(true)}
                  className="py-2 px-3 bg-surface-subtle hover:bg-surface border border-border rounded-lg text-xs font-semibold transition-colors"
                >
                  Adjust tokens
                </button>
              )}
            </div>
          </div>

          {/* Quick Summary Card */}
          <div className="p-5 rounded-card bg-surface-elevated border border-border space-y-4">
            <span className="text-xs font-semibold text-text-muted uppercase tracking-wider block">
              Biometric & account summary
            </span>
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between py-2 border-b border-border">
                <span className="text-text-muted">Enrolled fingers</span>
                <span className="font-bold">{student.finger_count} registered</span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-border">
                <span className="text-text-muted">Consent status</span>
                <span className="font-semibold text-success flex items-center gap-1">
                  <CheckCircle className="w-3.5 h-3.5" />
                  Consent on file
                </span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-border">
                <span className="text-text-muted">Student registered on</span>
                <span className="font-mono">
                  {new Date(student.created_at).toLocaleDateString()}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Fingerprints */}
      {activeTab === 'fingerprints' && (
        <div className="p-5 rounded-card bg-surface-elevated border border-border space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-border">
            <div>
              <h3 className="font-bold text-sm text-text">Biometric fingerprints</h3>
              <p className="text-[11px] text-text-muted">
                Templates are encrypted with AES-256-GCM. Raw templates are never accessible.
              </p>
            </div>
            <button
              onClick={() => setIsEnrollOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-accent hover:bg-accent-hover text-white text-xs font-semibold rounded-lg transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Enroll finger</span>
            </button>
          </div>

          <div className="divide-y divide-border">
            {student.fingerprints?.map((f: FingerprintType) => (
              <div key={f.id} className="py-3 flex items-center justify-between text-xs">
                <div className="flex items-center gap-3">
                  <div
                    className={`p-2 rounded-lg ${
                      f.is_active ? 'bg-accent/10 text-accent' : 'bg-surface-subtle text-text-muted'
                    }`}
                  >
                    <Fingerprint className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="font-semibold text-text block">{f.finger_label}</span>
                    <span className="text-[10px] text-text-muted font-mono">
                      Device ID: {f.device_user_id || 'N/A'} &bull; Enrolled{' '}
                      {new Date(f.enrolled_at).toLocaleDateString()}
                    </span>
                    {f.purged_at && (
                      <span className="text-[10px] text-danger font-semibold block">
                        Template purged on {new Date(f.purged_at).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Badge variant={f.is_active ? 'success' : 'neutral'}>
                    {f.is_active ? 'Active' : 'Inactive'}
                  </Badge>

                  {f.is_active && (
                    <button
                      onClick={() => handleDeactivateFinger(f.id)}
                      className="px-2 py-1 bg-surface-subtle hover:bg-surface border border-border rounded text-[11px] font-medium text-text-muted hover:text-text transition-colors"
                    >
                      Deactivate
                    </button>
                  )}

                  {isOwner && !f.purged_at && (
                    <button
                      onClick={() => {
                        setFingerToPurge(f);
                        setIsPurgeConfirmOpen(true);
                      }}
                      className="p-1 rounded text-text-muted hover:text-danger hover:bg-danger-subtle transition-colors"
                      title="Permanently purge biometric template (OWNER only)"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 3: Meal History */}
      {activeTab === 'meals' && (
        <div className="rounded-card bg-surface-elevated border border-border overflow-hidden">
          <div className="p-4 border-b border-border">
            <h3 className="font-bold text-sm text-text">Past meals</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-border bg-surface-subtle text-[11px] font-semibold text-text-muted uppercase">
                  <th className="py-2.5 px-4">Date</th>
                  <th className="py-2.5 px-4">Window</th>
                  <th className="py-2.5 px-4">Method</th>
                  <th className="py-2.5 px-4">Result</th>
                  <th className="py-2.5 px-4">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {mealLogs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-text-muted">
                      No meal records found for this student.
                    </td>
                  </tr>
                ) : (
                  mealLogs.map((m) => (
                    <tr key={m.id} className="hover:bg-surface-subtle transition-colors">
                      <td className="py-2.5 px-4 font-mono">{m.meal_date}</td>
                      <td className="py-2.5 px-4 font-semibold">{m.meal_window_name}</td>
                      <td className="py-2.5 px-4">
                        <Badge variant={m.method === 'MANUAL' ? 'warning' : 'accent'}>
                          {m.method}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-4">
                        <Badge variant={m.result === 'APPROVED' ? 'success' : 'danger'}>
                          {m.result}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-4 text-text-muted">
                        {m.manual_reason || m.reject_reason || 'Verified'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 4: Token Ledger */}
      {activeTab === 'ledger' && (
        <div className="rounded-card bg-surface-elevated border border-border overflow-hidden">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <div>
              <h3 className="font-bold text-sm text-text">Token ledger (Append-only)</h3>
              <p className="text-[11px] text-text-muted">
                Immutable audit record of all token additions and deductions.
              </p>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-text-muted uppercase font-bold block">
                Current balance
              </span>
              <span className="text-base font-black text-accent">{student.tokens_left}</span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-border bg-surface-subtle text-[11px] font-semibold text-text-muted uppercase">
                  <th className="py-2.5 px-4">Timestamp</th>
                  <th className="py-2.5 px-4">Reason</th>
                  <th className="py-2.5 px-4">Method</th>
                  <th className="py-2.5 px-4 text-center">Change</th>
                  <th className="py-2.5 px-4">Note / Logged by</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {ledgerEntries.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-text-muted">
                      No ledger transactions found.
                    </td>
                  </tr>
                ) : (
                  ledgerEntries.map((l) => (
                    <tr key={l.id} className="hover:bg-surface-subtle transition-colors">
                      <td className="py-2.5 px-4 font-mono text-[11px] text-text-muted">
                        {new Date(l.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
                      </td>
                      <td className="py-2.5 px-4 font-semibold">{l.reason}</td>
                      <td className="py-2.5 px-4">
                        <Badge variant="neutral">{l.method}</Badge>
                      </td>
                      <td className="py-2.5 px-4 text-center">
                        <span
                          className={`font-bold font-mono ${
                            l.change_amount > 0 ? 'text-success' : 'text-danger'
                          }`}
                        >
                          {l.change_amount > 0 ? `+${l.change_amount}` : l.change_amount}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-text-muted">
                        {l.note || '—'} {l.created_by_name && `(${l.created_by_name})`}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal: Sell / Renew Plan */}
      <Modal isOpen={isSellOpen} onClose={() => setIsSellOpen(false)} title="Sell / Renew meal plan">
        <form onSubmit={handleSellPlan} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold mb-1">Select plan *</label>
            <select
              value={selectedPlanId}
              onChange={(e) => setSelectedPlanId(e.target.value)}
              className="w-full px-3 py-2 bg-surface text-xs rounded-lg border border-border"
            >
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {p.tokens} tokens ({p.validity_days} days) - ₹{p.price_inr}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1">Payment mode *</label>
            <select
              value={paymentMode}
              onChange={(e) => setPaymentMode(e.target.value as any)}
              className="w-full px-3 py-2 bg-surface text-xs rounded-lg border border-border"
            >
              <option value="UPI">UPI</option>
              <option value="CASH">Cash</option>
              <option value="OTHER">Other / Bank transfer</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1">Start date *</label>
            <input
              type="date"
              required
              value={planStartDate}
              onChange={(e) => setPlanStartDate(e.target.value)}
              className="w-full px-3 py-2 bg-surface text-xs rounded-lg border border-border font-mono"
            />
          </div>

          <div className="pt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsSellOpen(false)}
              className="px-3 py-2 rounded-lg border border-border text-xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg text-xs font-semibold"
            >
              Sell plan
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Adjust Tokens (OWNER only) */}
      <Modal
        isOpen={isAdjustOpen}
        onClose={() => setIsAdjustOpen(false)}
        title="Manual token adjustment (OWNER only)"
      >
        <form onSubmit={handleAdjustTokens} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold mb-1">
              Token amount (+ to add, - to deduct) *
            </label>
            <input
              type="number"
              required
              value={adjustAmount || ''}
              onChange={(e) => setAdjustAmount(parseInt(e.target.value, 10) || 0)}
              placeholder="e.g. +5 or -2"
              className="w-full px-3 py-2 bg-surface text-xs rounded-lg border border-border font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1">Reason *</label>
            <input
              type="text"
              required
              value={adjustReason}
              onChange={(e) => setAdjustReason(e.target.value)}
              placeholder="e.g. Compensation for mess closure"
              className="w-full px-3 py-2 bg-surface text-xs rounded-lg border border-border"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1">Optional note</label>
            <input
              type="text"
              value={adjustNote}
              onChange={(e) => setAdjustNote(e.target.value)}
              placeholder="Additional audit details..."
              className="w-full px-3 py-2 bg-surface text-xs rounded-lg border border-border"
            />
          </div>

          <div className="pt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsAdjustOpen(false)}
              className="px-3 py-2 rounded-lg border border-border text-xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg text-xs font-semibold"
            >
              Adjust tokens
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Enroll Fingerprint */}
      <FingerprintScanModal
        isOpen={isEnrollOpen}
        onClose={() => setIsEnrollOpen(false)}
        studentName={student.name}
        studentCode={student.student_code}
        fingerLabel={enrollFingerLabel}
        onSuccess={handleEnrollFinger}
      />

      {/* Modal: Confirm Purge (OWNER only) */}
      <Modal
        isOpen={isPurgeConfirmOpen}
        onClose={() => setIsPurgeConfirmOpen(false)}
        title="Permanently erase biometric template"
      >
        <div className="space-y-4 text-xs">
          <div className="p-3 rounded-lg bg-danger-subtle text-danger border border-danger-border flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 flex-shrink-0" />
            <span>
              This will permanently destroy the encrypted biometric template from the database in compliance with privacy regulations.
            </span>
          </div>

          <p className="text-text-muted">
            The student's name, profile, token ledger, and past meal attendance records will be retained. Only the fingerprint template data will be erased.
          </p>

          <div className="pt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsPurgeConfirmOpen(false)}
              className="px-3 py-2 rounded-lg border border-border text-xs"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handlePurgeFinger}
              className="px-4 py-2 bg-danger hover:bg-danger/90 text-white rounded-lg text-xs font-semibold"
            >
              Permanently purge template
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
