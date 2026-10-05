import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  UserPlus,
  Shield,
  History,
  AlertCircle,
  CheckCircle2,
  Lock,
} from 'lucide-react';
import { apiRequest } from '../api/client';
import { Badge } from '../components/common/Badge';
import { Skeleton } from '../components/common/Skeleton';
import { Modal } from '../components/common/Modal';
import { AdminUser } from '../types';

export const StaffAuditPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'staff' | 'audit'>('staff');

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

  const fetchStaff = async () => {
    setLoadingStaff(true);
    try {
      const data = await apiRequest<AdminUser[]>('/staff');
      setStaffList(data);
    } catch (e) {
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
      setTotalPages(res.pagination.totalPages || 1);
    } catch (e) {
    } finally {
      setLoadingAudit(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'staff') fetchStaff();
    if (activeTab === 'audit') fetchAudit();
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

  const handleToggleActive = async (user: AdminUser) => {
    if (!window.confirm(`Are you sure you want to ${user.is_active ? 'deactivate' : 'activate'} this user?`))
      return;

    try {
      await apiRequest(`/staff/${user.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: !user.is_active }),
      });
      fetchStaff();
    } catch (err: any) {
      alert(err.message || 'Failed to update user status');
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-text">Staff administration & audit log</h2>
          <span className="text-xs text-text-muted">
            Manage admin users, roles, and review security audit trail
          </span>
        </div>

        {activeTab === 'staff' && (
          <button
            onClick={() => setIsAddOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-accent hover:bg-accent-hover text-white text-xs font-semibold rounded-lg shadow-xs transition-colors"
          >
            <UserPlus className="w-4 h-4" />
            <span>Add staff account</span>
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-border flex items-center gap-6 text-xs font-semibold">
        <button
          onClick={() => setActiveTab('staff')}
          className={`pb-3 flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'staff'
              ? 'border-accent text-accent'
              : 'border-transparent text-text-muted hover:text-text'
          }`}
        >
          <Shield className="w-4 h-4" />
          <span>Staff accounts</span>
        </button>

        <button
          onClick={() => setActiveTab('audit')}
          className={`pb-3 flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'audit'
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
                  staffList.map((user) => (
                    <tr key={user.id} className="hover:bg-surface-subtle transition-colors">
                      <td className="py-3 px-4 font-semibold text-text">{user.name}</td>
                      <td className="py-3 px-4 text-text-muted font-mono">{user.email}</td>
                      <td className="py-3 px-4">
                        <Badge variant={user.role === 'OWNER' ? 'accent' : 'neutral'}>
                          {user.role}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <Badge variant={user.is_active ? 'success' : 'danger'}>
                          {user.is_active ? 'Active' : 'Disabled'}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => handleToggleActive(user)}
                          className="px-2 py-1 rounded border border-border text-[11px] hover:bg-surface transition-colors"
                        >
                          {user.is_active ? 'Deactivate' : 'Activate'}
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

      {/* Tab 2: Audit Log */}
      {activeTab === 'audit' && (
        <div className="space-y-4">
          {/* Action Filter */}
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
              <option value="STUDENT_CREATE">Student Create</option>
              <option value="PLAN_SELL">Plan Sell</option>
              <option value="TOKEN_ADJUST">Token Adjust</option>
              <option value="MANUAL_MEAL_MARKED">Manual Meal</option>
              <option value="FINGERPRINT_ENROLL">Fingerprint Enroll</option>
              <option value="FINGERPRINT_PURGE">Fingerprint Purge</option>
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

          <div className="pt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsAddOpen(false)}
              className="px-3.5 py-2 rounded-lg border border-border text-xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submittingStaff}
              className="px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg text-xs font-semibold disabled:opacity-50"
            >
              {submittingStaff ? 'Creating...' : 'Create account'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
