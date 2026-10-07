import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  UserPlus,
  Shield,
  History,
  AlertCircle,
  CheckCircle2,
  Lock,
  KeyRound,
  LogOut,
  QrCode,
  ShieldAlert,
} from 'lucide-react';
import { apiRequest } from '../api/client';
import { Badge } from '../components/common/Badge';
import { Skeleton } from '../components/common/Skeleton';
import { Modal } from '../components/common/Modal';
import { AdminUser } from '../types';
import { useAuth } from '../context/AuthContext';

export const StaffAuditPage: React.FC = () => {
  const { user, isOwner, revokeAllSessions, refreshUserData } = useAuth();
  const [activeTab, setActiveTab] = useState<'staff' | 'audit' | 'security'>('staff');

  // Staff State
  const [staffList, setStaffList] = useState<AdminUser[]>([]);
  const [loadingStaff, setLoadingStaff] = useState(true);

  // Add Staff Modal State
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'OWNER' | 'COUNTER'>('COUNTER');
  const [submittingStaff, setSubmittingStaff] = useState(false);
  const [staffError, setStaffError] = useState<string | null>(null);

  // Audit Log State
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [actionFilter, setActionFilter] = useState('');

  // 2FA Security State
  const [totpEnabled, setTotpEnabled] = useState(Boolean(user?.totp_enabled));
  const [setupData, setSetupData] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [verifyCode, setVerifyCode] = useState('');
  const [securityMessage, setSecurityMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [securityLoading, setSecurityLoading] = useState(false);

  const fetchStaff = async () => {
    setLoadingStaff(true);
    try {
      const data = await apiRequest<AdminUser[]>('/staff');
      setStaffList(data);
    } catch {
    } finally {
      setLoadingStaff(false);
    }
  };

  const fetchAudit = async () => {
    setLoadingAudit(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: '25',
      });
      if (actionFilter) params.set('action', actionFilter);

      const res = await apiRequest(`/audit?${params.toString()}`);
      setAuditLogs(res.data);
      setTotalPages(res.pagination?.totalPages || 1);
    } catch {
    } finally {
      setLoadingAudit(false);
    }
  };

  const check2FAStatus = async () => {
    try {
      const res = await apiRequest<{ enabled: boolean }>('/auth/2fa/status');
      setTotpEnabled(res.enabled);
    } catch {
    }
  };

  useEffect(() => {
    if (activeTab === 'staff') fetchStaff();
    if (activeTab === 'audit') fetchAudit();
    if (activeTab === 'security') check2FAStatus();
  }, [activeTab, page, actionFilter]);

  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingStaff(true);
    setStaffError(null);

    try {
      await apiRequest('/staff', {
        method: 'POST',
        body: JSON.stringify({ name, email, password, role }),
      });
      setIsAddOpen(false);
      setName('');
      setEmail('');
      setPassword('');
      fetchStaff();
    } catch (err: any) {
      setStaffError(err.message || 'Failed to create staff account');
    } finally {
      setSubmittingStaff(false);
    }
  };

  const handleToggleActive = async (targetUser: AdminUser) => {
    if (!window.confirm(`Are you sure you want to ${targetUser.is_active ? 'deactivate' : 'activate'} this user?`))
      return;

    try {
      await apiRequest(`/staff/${targetUser.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: !targetUser.is_active }),
      });
      fetchStaff();
    } catch (err: any) {
      alert(err.message || 'Failed to update user status');
    }
  };

  const handleStart2FASetup = async () => {
    setSecurityLoading(true);
    setSecurityMessage(null);
    try {
      const data = await apiRequest<{ secret: string; otpauthUrl: string }>('/auth/2fa/setup', {
        method: 'POST',
      });
      setSetupData(data);
    } catch (err: any) {
      setSecurityMessage({ type: 'error', text: err.message || 'Failed to initiate 2FA setup' });
    } finally {
      setSecurityLoading(false);
    }
  };

  const handleEnable2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    setSecurityLoading(true);
    setSecurityMessage(null);

    try {
      await apiRequest('/auth/2fa/enable', {
        method: 'POST',
        body: JSON.stringify({ code: verifyCode }),
      });
      setTotpEnabled(true);
      setSetupData(null);
      setVerifyCode('');
      setSecurityMessage({ type: 'success', text: 'Two-factor authentication enabled successfully!' });
      refreshUserData();
    } catch (err: any) {
      setSecurityMessage({ type: 'error', text: err.message || 'Invalid verification code' });
    } finally {
      setSecurityLoading(false);
    }
  };

  const handleDisable2FA = async () => {
    const code = prompt('Enter current 6-digit 2FA code from your Authenticator app to disable:');
    if (!code) return;

    setSecurityLoading(true);
    setSecurityMessage(null);

    try {
      await apiRequest('/auth/2fa/disable', {
        method: 'POST',
        body: JSON.stringify({ code: code.trim() }),
      });
      setTotpEnabled(false);
      setSecurityMessage({ type: 'success', text: 'Two-factor authentication disabled' });
      refreshUserData();
    } catch (err: any) {
      setSecurityMessage({ type: 'error', text: err.message || 'Failed to disable 2FA' });
    } finally {
      setSecurityLoading(false);
    }
  };

  const handleRevokeAllSessions = async () => {
    if (window.confirm('Are you sure you want to revoke all active sessions across all devices? You will need to log in again.')) {
      await revokeAllSessions();
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 sm:gap-4">
        <div>
          <h2 className="text-base font-bold text-text">Staff administration & security</h2>
          <span className="text-xs text-text-muted">
            Manage admin users, roles, 2FA security, and review audit trail
          </span>
        </div>

        {activeTab === 'staff' && (
          <button
            onClick={() => setIsAddOpen(true)}
            className="flex items-center justify-center gap-1.5 px-3.5 py-2 bg-accent hover:bg-accent-hover text-white text-xs font-semibold rounded-lg shadow-xs transition-colors w-full sm:w-auto"
          >
            <UserPlus className="w-4 h-4" />
            <span>Add staff account</span>
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-border flex items-center gap-4 sm:gap-6 text-xs font-semibold overflow-x-auto whitespace-nowrap">
        <button
          onClick={() => setActiveTab('staff')}
          className={`pb-3 flex items-center gap-2 border-b-2 flex-shrink-0 transition-colors ${activeTab === 'staff'
              ? 'border-accent text-accent'
              : 'border-transparent text-text-muted hover:text-text'
            }`}
        >
          <Shield className="w-4 h-4" />
          <span>Staff accounts</span>
        </button>

        <button
          onClick={() => setActiveTab('security')}
          className={`pb-3 flex items-center gap-2 border-b-2 flex-shrink-0 transition-colors ${activeTab === 'security'
              ? 'border-accent text-accent'
              : 'border-transparent text-text-muted hover:text-text'
            }`}
        >
          <KeyRound className="w-4 h-4" />
          <span>Security & 2FA</span>
        </button>

        <button
          onClick={() => setActiveTab('audit')}
          className={`pb-3 flex items-center gap-2 border-b-2 flex-shrink-0 transition-colors ${activeTab === 'audit'
              ? 'border-accent text-accent'
              : 'border-transparent text-text-muted hover:text-text'
            }`}
        >
          <History className="w-4 h-4" />
          <span>Security audit log</span>
        </button>
      </div>

      {/* Tab 1: Staff Accounts */}
      {activeTab === 'staff' && (
        <div className="rounded-card bg-surface-elevated border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-border bg-surface-subtle text-[11px] font-semibold text-text-muted uppercase">
                  <th className="py-3 px-4">Name</th>
                  <th className="py-3 px-4">Email</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loadingStaff ? (
                  [...Array(3)].map((_, i) => (
                    <tr key={i}>
                      <td colSpan={5} className="py-3 px-4">
                        <Skeleton className="h-6 w-full" />
                      </td>
                    </tr>
                  ))
                ) : (
                  staffList.map((st) => (
                    <tr key={st.id} className="hover:bg-surface-subtle transition-colors">
                      <td className="py-3 px-4 font-semibold text-text">{st.name}</td>
                      <td className="py-3 px-4 text-text-muted font-mono">{st.email}</td>
                      <td className="py-3 px-4">
                        <Badge variant={st.role === 'OWNER' ? 'accent' : 'neutral'}>
                          {st.role}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <Badge variant={st.is_active ? 'success' : 'danger'}>
                          {st.is_active ? 'Active' : 'Disabled'}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => handleToggleActive(st)}
                          className="px-2 py-1 rounded border border-border text-[11px] hover:bg-surface transition-colors"
                        >
                          {st.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: Security & 2FA */}
      {activeTab === 'security' && (
        <div className="space-y-6">
          {securityMessage && (
            <div
              className={`p-3 rounded-card text-xs flex items-center gap-2 border ${
                securityMessage.type === 'success'
                  ? 'bg-success-subtle text-success border-success-border'
                  : 'bg-danger-subtle text-danger border-danger-border'
              }`}
            >
              {securityMessage.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
              )}
              <span>{securityMessage.text}</span>
            </div>
          )}

          {/* 2FA Card */}
          <div className="bg-surface-elevated rounded-card border border-border p-5 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-text">Two-Factor Authentication (TOTP 2FA)</h3>
                  <Badge variant={totpEnabled ? 'success' : 'neutral'}>
                    {totpEnabled ? 'Enabled' : 'Disabled'}
                  </Badge>
                </div>
                <p className="text-xs text-text-muted">
                  Protect your Owner account by requiring a 6-digit TOTP token from Google Authenticator or Authy upon sign-in.
                </p>
              </div>

              {isOwner && (
                <div>
                  {totpEnabled ? (
                    <button
                      onClick={handleDisable2FA}
                      disabled={securityLoading}
                      className="py-1.5 px-3 rounded-lg border border-danger text-danger hover:bg-danger-subtle text-xs font-semibold transition-colors disabled:opacity-50"
                    >
                      Disable 2FA
                    </button>
                  ) : (
                    !setupData && (
                      <button
                        onClick={handleStart2FASetup}
                        disabled={securityLoading}
                        className="py-1.5 px-3 rounded-lg bg-accent hover:bg-accent-hover text-white text-xs font-semibold transition-colors disabled:opacity-50"
                      >
                        Set up 2FA
                      </button>
                    )
                  )}
                </div>
              )}
            </div>

            {/* Setup Form if 2FA Setup is initiated */}
            {setupData && !totpEnabled && (
              <div className="mt-4 pt-4 border-t border-border space-y-4 bg-surface-subtle p-4 rounded-lg">
                <h4 className="text-xs font-bold text-text flex items-center gap-2">
                  <QrCode className="w-4 h-4 text-accent" />
                  <span>Configure Authenticator App</span>
                </h4>

                <div className="space-y-2 text-xs text-text-muted">
                  <p>1. Open your authenticator app (Google Authenticator, Microsoft Authenticator, Authy, etc.).</p>
                  <p>2. Add an account using the manual setup key below or import URL:</p>
                  <div className="p-2.5 bg-surface rounded border border-border font-mono text-xs text-accent select-all break-all">
                    {setupData.secret}
                  </div>
                  <p className="text-[11px] text-text-muted">
                    URI: <span className="select-all break-all font-mono">{setupData.otpauthUrl}</span>
                  </p>
                </div>

                <form onSubmit={handleEnable2FA} className="space-y-3 pt-2">
                  <div>
                    <label className="block text-xs font-semibold text-text mb-1">
                      3. Enter 6-digit verification code to confirm
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={6}
                      pattern="\d{6}"
                      value={verifyCode}
                      onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, ''))}
                      placeholder="000000"
                      className="w-48 text-center tracking-widest font-mono text-base py-2 bg-surface text-text rounded-lg border border-border focus:border-accent focus:outline-hidden"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="submit"
                      disabled={securityLoading || verifyCode.length !== 6}
                      className="py-2 px-4 bg-accent hover:bg-accent-hover text-white rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
                    >
                      {securityLoading ? 'Verifying...' : 'Verify & Enable 2FA'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setSetupData(null)}
                      className="py-2 px-3 text-text-muted hover:text-text text-xs"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>

          {/* Session Management Card */}
          <div className="bg-surface-elevated rounded-card border border-border p-5 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-text flex items-center gap-2">
                  <LogOut className="w-4 h-4 text-danger" />
                  <span>Session Security & Revocation</span>
                </h3>
                <p className="text-xs text-text-muted">
                  All active refresh tokens are hashed in the database. If you suspect unauthorized access or lost a device, revoke all active sessions immediately.
                </p>
              </div>

              <button
                onClick={handleRevokeAllSessions}
                className="py-1.5 px-3 rounded-lg bg-danger-subtle hover:bg-danger text-danger hover:text-white border border-danger-border text-xs font-semibold transition-colors"
              >
                Revoke All Sessions
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Audit Log */}
      {activeTab === 'audit' && (
        <div className="space-y-4">
          <div className="p-3 rounded-card bg-surface-elevated border border-border flex items-center justify-between text-xs">
            <span className="font-semibold text-text-muted">Filter actions:</span>
            <select
              value={actionFilter}
              onChange={(e) => {
                setActionFilter(e.target.value);
                setPage(1);
              }}
              className="px-3 py-1 bg-surface rounded border border-border text-xs"
            >
              <option value="">All actions</option>
              <option value="AUTH_LOGIN">Login</option>
              <option value="LOGIN_FAILED">Login Failed</option>
              <option value="ACCOUNT_LOCKED">Account Locked</option>
              <option value="PASSWORD_CHANGED">Password Changed</option>
              <option value="2FA_ENABLED">2FA Enabled</option>
              <option value="2FA_DISABLED">2FA Disabled</option>
              <option value="REVOKE_ALL_SESSIONS">Revoke All Sessions</option>
              <option value="STUDENT_CREATE">Student Create</option>
              <option value="PLAN_SELL">Plan Sell</option>
              <option value="TOKEN_ADJUST">Token Adjust</option>
              <option value="MANUAL_MEAL_MARKED">Manual Meal</option>
            </select>
          </div>

          <div className="rounded-card bg-surface-elevated border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-border bg-surface-subtle text-[11px] font-semibold text-text-muted uppercase">
                    <th className="py-2.5 px-4">Timestamp</th>
                    <th className="py-2.5 px-4">Admin user</th>
                    <th className="py-2.5 px-4">Action</th>
                    <th className="py-2.5 px-4">Target</th>
                    <th className="py-2.5 px-4">Details</th>
                    <th className="py-2.5 px-4">IP address</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {loadingAudit ? (
                    [...Array(6)].map((_, i) => (
                      <tr key={i}>
                        <td colSpan={6} className="py-3 px-4">
                          <Skeleton className="h-6 w-full" />
                        </td>
                      </tr>
                    ))
                  ) : auditLogs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-text-muted">
                        No audit events recorded.
                      </td>
                    </tr>
                  ) : (
                    auditLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-surface-subtle transition-colors">
                        <td className="py-2.5 px-4 font-mono text-[11px] text-text-muted">
                          {new Date(log.created_at).toLocaleString('en-IN', {
                            timeZone: 'Asia/Kolkata',
                          })}
                        </td>
                        <td className="py-2.5 px-4 font-semibold text-text">
                          {log.admin_name || 'System'}
                        </td>
                        <td className="py-2.5 px-4">
                          <Badge variant="accent">{log.action}</Badge>
                        </td>
                        <td className="py-2.5 px-4 font-mono text-text-muted">
                          {log.target_type} {log.target_id && `#${log.target_id}`}
                        </td>
                        <td className="py-2.5 px-4 max-w-xs truncate font-mono text-[11px] text-text-muted">
                          {JSON.stringify(log.detail || {})}
                        </td>
                        <td className="py-2.5 px-4 font-mono text-[11px] text-text-muted">
                          {log.ip || '—'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Add Staff Modal */}
      <Modal
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        title="Create staff account"
      >
        {staffError && (
          <div className="mb-4 p-3 rounded bg-danger-subtle text-danger border border-danger-border text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{staffError}</span>
          </div>
        )}

        <form onSubmit={handleAddStaff} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold mb-1">Full name *</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Ramesh Kumar"
              className="w-full px-3 py-2 bg-surface text-xs rounded-lg border border-border"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1">Email address *</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="staff@mess.local"
              className="w-full px-3 py-2 bg-surface text-xs rounded-lg border border-border"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1">Initial password *</label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-3 py-2 bg-surface text-xs rounded-lg border border-border font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1">Role *</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as any)}
              className="w-full px-3 py-2 bg-surface text-xs rounded-lg border border-border"
            >
              <option value="COUNTER">COUNTER (Counter screen and student lookup only)</option>
              <option value="OWNER">OWNER (Full administrative access)</option>
            </select>
          </div>

          <div className="pt-4 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsAddOpen(false)}
              className="px-3.5 py-2 rounded-lg border border-border text-xs text-center hover:bg-surface-subtle transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submittingStaff}
              className="px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg text-xs font-semibold disabled:opacity-50 text-center"
            >
              {submittingStaff ? 'Creating...' : 'Create account'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
