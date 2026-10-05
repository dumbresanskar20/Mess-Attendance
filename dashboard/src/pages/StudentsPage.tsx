import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  Plus,
  ChevronLeft,
  ChevronRight,
  Fingerprint,
  AlertCircle,
  CheckCircle,
} from 'lucide-react';
import { apiRequest } from '../api/client';
import { Badge } from '../components/common/Badge';
import { Skeleton } from '../components/common/Skeleton';
import { Modal } from '../components/common/Modal';
import { Student } from '../types';

export const StudentsPage: React.FC = () => {
  const navigate = useNavigate();

  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'expiring' | 'low_balance' | 'few_fingers'>('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Add Student Modal State
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newPhoto, setNewPhoto] = useState('');
  const [newConsent, setNewConsent] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const fetchStudents = async () => {
    setLoading(true);
    try {
      const queryParams = new URLSearchParams({
        page: String(page),
        limit: '15',
        filter,
      });
      if (search.trim()) queryParams.set('search', search.trim());

      const res = await apiRequest(`/students?${queryParams.toString()}`);
      setStudents(res.data);
      setTotalPages(res.pagination.totalPages || 1);
      setTotalCount(res.pagination.total || 0);
    } catch (e) {
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStudents();
  }, [page, filter]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      fetchStudents();
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const handleAddStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError(null);

    if (!newConsent) {
      setAddError('Consent is required before adding a student.');
      return;
    }

    setSubmitting(true);
    try {
      const created = await apiRequest('/students', {
        method: 'POST',
        body: JSON.stringify({
          student_code: newCode,
          name: newName,
          phone: newPhone,
          photo_path: newPhoto || null,
          consent_given: newConsent,
        }),
      });

      setIsAddOpen(false);
      setNewCode('');
      setNewName('');
      setNewPhone('');
      setNewPhoto('');
      setNewConsent(false);
      navigate(`/students/${created.id}`);
    } catch (err: any) {
      setAddError(err.message || 'Failed to create student');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Header Actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-text">Student directory</h2>
          <span className="text-xs text-text-muted">
            {totalCount} students registered
          </span>
        </div>

        <button
          onClick={() => {
            setNewCode(`STU-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`);
            setIsAddOpen(true);
          }}
          className="flex items-center gap-1.5 px-3.5 py-2 bg-accent hover:bg-accent-hover text-white text-xs font-semibold rounded-lg shadow-sm transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>Add student</span>
        </button>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="p-4 rounded-card bg-surface-elevated border border-border space-y-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by student name, code, or phone..."
              className="w-full pl-9 pr-3 py-1.5 bg-surface text-xs rounded-lg border border-border focus:border-accent focus:outline-hidden"
            />
          </div>

          {/* Filter Pills */}
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { id: 'all', label: 'All' },
              { id: 'expiring', label: 'Expiring soon' },
              { id: 'low_balance', label: 'Low balance (≤ 4)' },
              { id: 'few_fingers', label: '< 2 Fingers' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  setFilter(tab.id as any);
                  setPage(1);
                }}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  filter === tab.id
                    ? 'bg-accent text-white font-semibold shadow-xs'
                    : 'bg-surface hover:bg-surface-subtle text-text-muted hover:text-text border border-border'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Students Table */}
      <div className="rounded-card bg-surface-elevated border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border bg-surface-subtle text-[11px] font-semibold text-text-muted uppercase tracking-wider">
                <th className="py-3 px-4">Student</th>
                <th className="py-3 px-4">Phone</th>
                <th className="py-3 px-4">Active plan</th>
                <th className="py-3 px-4 text-center">Tokens left</th>
                <th className="py-3 px-4">Plan end date</th>
                <th className="py-3 px-4 text-center">Fingers</th>
                <th className="py-3 px-4 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border text-xs">
              {loading ? (
                [...Array(6)].map((_, i) => (
                  <tr key={i}>
                    <td colSpan={7} className="py-3 px-4">
                      <Skeleton className="h-6 w-full" />
                    </td>
                  </tr>
                ))
              ) : students.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-xs text-text-muted">
                    No students found matching your criteria.
                  </td>
                </tr>
              ) : (
                students.map((s) => (
                  <tr
                    key={s.id}
                    onClick={() => navigate(`/students/${s.id}`)}
                    className="hover:bg-surface-subtle cursor-pointer transition-colors"
                  >
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <img
                          src={
                            s.photo_path ||
                            `https://api.dicebear.com/7.x/avataaars/svg?seed=${s.student_code}`
                          }
                          alt={s.name}
                          className="w-8 h-8 rounded-full border border-border object-cover bg-surface-subtle"
                        />
                        <div>
                          <span className="font-semibold text-text block">{s.name}</span>
                          <span className="text-[10px] text-text-muted font-mono">
                            {s.student_code}
                          </span>
                        </div>
                      </div>
                    </td>

                    <td className="py-3 px-4 font-mono text-text-muted">{s.phone}</td>

                    <td className="py-3 px-4">
                      {s.active_plan ? (
                        <span className="font-medium text-text">{s.active_plan}</span>
                      ) : (
                        <span className="text-text-muted italic">No active plan</span>
                      )}
                    </td>

                    <td className="py-3 px-4 text-center">
                      <Badge
                        variant={
                          s.tokens_left > 10
                            ? 'success'
                            : s.tokens_left > 0
                            ? 'warning'
                            : 'danger'
                        }
                      >
                        {s.tokens_left}
                      </Badge>
                    </td>

                    <td className="py-3 px-4 text-text-muted">
                      {s.plan_end_date || '—'}
                    </td>

                    <td className="py-3 px-4 text-center">
                      <span
                        className={`inline-flex items-center gap-1 font-semibold ${
                          s.finger_count < 2 ? 'text-warning' : 'text-text'
                        }`}
                      >
                        <Fingerprint className="w-3.5 h-3.5" />
                        <span>{s.finger_count}</span>
                      </span>
                    </td>

                    <td className="py-3 px-4 text-center">
                      <Badge variant={s.status === 'ACTIVE' ? 'success' : 'neutral'}>
                        {s.status}
                      </Badge>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="p-4 border-t border-border flex items-center justify-between text-xs text-text-muted">
          <span>
            Page {page} of {totalPages}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="p-1.5 rounded border border-border hover:bg-surface-subtle disabled:opacity-30 disabled:pointer-events-none transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="p-1.5 rounded border border-border hover:bg-surface-subtle disabled:opacity-30 disabled:pointer-events-none transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Add Student Modal */}
      <Modal
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        title="Register new student"
      >
        {addError && (
          <div className="mb-4 p-3 rounded bg-danger-subtle text-danger border border-danger-border text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{addError}</span>
          </div>
        )}

        <form onSubmit={handleAddStudent} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-text mb-1">
              Student code *
            </label>
            <input
              type="text"
              required
              value={newCode}
              onChange={(e) => setNewCode(e.target.value.toUpperCase())}
              placeholder="STU-2026-031"
              className="w-full px-3 py-2 bg-surface text-xs rounded-lg border border-border focus:border-accent focus:outline-hidden font-mono uppercase"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-text mb-1">
              Full name *
            </label>
            <input
              type="text"
              required
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Rahul Sharma"
              className="w-full px-3 py-2 bg-surface text-xs rounded-lg border border-border focus:border-accent focus:outline-hidden"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-text mb-1">
              Phone number *
            </label>
            <input
              type="tel"
              required
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
              placeholder="9876543210"
              className="w-full px-3 py-2 bg-surface text-xs rounded-lg border border-border focus:border-accent focus:outline-hidden font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-text mb-1">
              Photo URL (optional)
            </label>
            <input
              type="url"
              value={newPhoto}
              onChange={(e) => setNewPhoto(e.target.value)}
              placeholder="https://example.com/photo.jpg"
              className="w-full px-3 py-2 bg-surface text-xs rounded-lg border border-border focus:border-accent focus:outline-hidden"
            />
          </div>

          {/* Consent Checkbox (Mandatory) */}
          <div className="pt-2 border-t border-border">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                required
                checked={newConsent}
                onChange={(e) => setNewConsent(e.target.checked)}
                className="mt-0.5 rounded border-border text-accent focus:ring-accent"
              />
              <span className="text-[11px] text-text-muted leading-tight">
                Student has provided informed biometric consent to enroll and store fingerprint templates for mess token authentication.
              </span>
            </label>
          </div>

          <div className="pt-4 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsAddOpen(false)}
              className="px-3.5 py-2 rounded-lg border border-border text-xs font-medium hover:bg-surface-subtle transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-xs font-semibold transition-colors disabled:opacity-50"
            >
              {submitting ? 'Creating...' : 'Register student'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
