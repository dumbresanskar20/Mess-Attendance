import React, { useState, useEffect } from 'react';
import {
  Download,
  Filter,
  Search,
  ChevronLeft,
  ChevronRight,
  Clock,
  Calendar,
} from 'lucide-react';
import { apiRequest } from '../api/client';
import { Badge } from '../components/common/Badge';
import { Skeleton } from '../components/common/Skeleton';
import { MealLogItem } from '../types';

export const MealLogPage: React.FC = () => {
  const [meals, setMeals] = useState<MealLogItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [method, setMethod] = useState<string>('');
  const [result, setResult] = useState<string>('');
  const [windowId, setWindowId] = useState<string>('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const fetchMeals = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: '20',
      });
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      if (method) params.set('method', method);
      if (result) params.set('result', result);
      if (windowId) params.set('windowId', windowId);

      const res = await apiRequest(`/meals?${params.toString()}`);
      setMeals(res.data);
      setTotalPages(res.pagination.totalPages || 1);
      setTotalCount(res.pagination.total || 0);
    } catch (e) {
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMeals();
  }, [page, startDate, endDate, method, result, windowId]);

  // CSV Export handler
  const handleExportCSV = () => {
    if (meals.length === 0) return;
    const headers = [
      'ID',
      'Date',
      'Window',
      'Student Code',
      'Student Name',
      'Method',
      'Result',
      'Details',
      'Timestamp',
    ];
    const rows = meals.map((m) => [
      m.id,
      m.meal_date,
      m.meal_window_name || 'N/A',
      m.student_code || 'N/A',
      `"${m.student_name || 'Unknown'}"`,
      m.method,
      m.result,
      `"${m.manual_reason || m.reject_reason || 'Verified'}"`,
      m.created_at,
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `meal_log_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 sm:gap-4">
        <div>
          <h2 className="text-base font-bold text-text">Meal attendance log</h2>
          <span className="text-xs text-text-muted">
            {totalCount} total scans and meals recorded (append-only)
          </span>
        </div>

        <button
          onClick={handleExportCSV}
          className="flex items-center justify-center gap-1.5 px-3.5 py-2 bg-surface-elevated hover:bg-surface border border-border text-text text-xs font-semibold rounded-lg shadow-xs transition-colors w-full sm:w-auto"
        >
          <Download className="w-4 h-4" />
          <span>Export CSV</span>
        </button>
      </div>

      {/* Filter Bar */}
      <div className="p-4 rounded-card bg-surface-elevated border border-border space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 text-xs">
          <div>
            <label className="block text-[11px] font-semibold text-text-muted mb-1">
              Start date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setPage(1);
              }}
              className="w-full px-2.5 py-1.5 bg-surface rounded border border-border font-mono text-xs"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-text-muted mb-1">
              End date
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setPage(1);
              }}
              className="w-full px-2.5 py-1.5 bg-surface rounded border border-border font-mono text-xs"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-text-muted mb-1">
              Meal window
            </label>
            <select
              value={windowId}
              onChange={(e) => {
                setWindowId(e.target.value);
                setPage(1);
              }}
              className="w-full px-2.5 py-1.5 bg-surface rounded border border-border text-xs"
            >
              <option value="">All windows</option>
              <option value="1">Lunch</option>
              <option value="2">Dinner</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-text-muted mb-1">
              Method
            </label>
            <select
              value={method}
              onChange={(e) => {
                setMethod(e.target.value);
                setPage(1);
              }}
              className="w-full px-2.5 py-1.5 bg-surface rounded border border-border text-xs"
            >
              <option value="">All methods</option>
              <option value="FINGERPRINT">Fingerprint</option>
              <option value="MANUAL">Manual</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-text-muted mb-1">
              Result
            </label>
            <select
              value={result}
              onChange={(e) => {
                setResult(e.target.value);
                setPage(1);
              }}
              className="w-full px-2.5 py-1.5 bg-surface rounded border border-border text-xs"
            >
              <option value="">All results</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-card bg-surface-elevated border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-border bg-surface-subtle text-[11px] font-semibold text-text-muted uppercase">
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4">Student</th>
                <th className="py-3 px-4">Window</th>
                <th className="py-3 px-4">Method</th>
                <th className="py-3 px-4">Result</th>
                <th className="py-3 px-4">Details / Staff</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                [...Array(6)].map((_, i) => (
                  <tr key={i}>
                    <td colSpan={6} className="py-3 px-4">
                      <Skeleton className="h-6 w-full" />
                    </td>
                  </tr>
                ))
              ) : meals.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-text-muted">
                    No meal records found for the selected filters.
                  </td>
                </tr>
              ) : (
                meals.map((m) => (
                  <tr key={m.id} className="hover:bg-surface-subtle transition-colors">
                    <td className="py-3 px-4 font-mono text-text-muted">
                      {new Date(m.created_at).toLocaleString('en-IN', {
                        timeZone: 'Asia/Kolkata',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                        day: '2-digit',
                        month: 'short',
                      })}
                    </td>

                    <td className="py-3 px-4">
                      {m.student_name ? (
                        <div>
                          <span className="font-semibold block">{m.student_name}</span>
                          <span className="text-[10px] text-text-muted font-mono">
                            {m.student_code}
                          </span>
                        </div>
                      ) : (
                        <span className="text-text-muted italic">Unmatched scan</span>
                      )}
                    </td>

                    <td className="py-3 px-4 font-medium text-text">
                      {m.meal_window_name || 'N/A'}
                    </td>

                    <td className="py-3 px-4">
                      <Badge variant={m.method === 'MANUAL' ? 'warning' : 'accent'}>
                        {m.method}
                      </Badge>
                    </td>

                    <td className="py-3 px-4">
                      <Badge variant={m.result === 'APPROVED' ? 'success' : 'danger'}>
                        {m.result}
                      </Badge>
                    </td>

                    <td className="py-3 px-4 text-text-muted">
                      {m.manual_reason ? (
                        <span>
                          {m.manual_reason} {m.marked_by_name && `(${m.marked_by_name})`}
                        </span>
                      ) : m.reject_reason ? (
                        <span className="text-danger font-medium">
                          {m.reject_reason.replace('_', ' ')}
                        </span>
                      ) : (
                        <span>Verified</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
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
    </div>
  );
};
