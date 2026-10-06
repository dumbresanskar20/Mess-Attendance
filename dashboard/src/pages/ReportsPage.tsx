import React, { useState, useEffect } from 'react';
import {
  FileBarChart,
  Download,
  Calendar,
  IndianRupee,
  Utensils,
  CreditCard,
  FileSpreadsheet,
  FileText,
} from 'lucide-react';
import { apiRequest, BASE_URL } from '../api/client';
import { Skeleton } from '../components/common/Skeleton';

export const ReportsPage: React.FC = () => {
  const now = new Date();
  const [year, setYear] = useState<number>(now.getFullYear());
  const [month, setMonth] = useState<number>(now.getMonth() + 1);
  const [report, setReport] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchReport = async () => {
    setLoading(true);
    try {
      const data = await apiRequest(`/reports/monthly?year=${year}&month=${month}`);
      setReport(data);
    } catch (e) {
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, [year, month]);

  const handleDownload = (format: 'xlsx' | 'pdf') => {
    const token = localStorage.getItem('access_token');
    const url = `${BASE_URL}/reports/monthly?year=${year}&month=${month}&format=${format}`;

    // Direct authenticated fetch and download
    fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
      .then((res) => res.blob())
      .then((blob) => {
        const downloadUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = `monthly_report_${year}_${month}.${format}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      });
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-text">Monthly reports</h2>
          <span className="text-xs text-text-muted">
            Aggregated mess attendance, revenue, and staff audits
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* Month Selector */}
          <select
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            className="px-3 py-1.5 bg-surface-elevated text-xs rounded-lg border border-border"
          >
            {[
              'January', 'February', 'March', 'April', 'May', 'June',
              'July', 'August', 'September', 'October', 'November', 'December'
            ].map((name, i) => (
              <option key={i + 1} value={i + 1}>
                {name}
              </option>
            ))}
          </select>

          {/* Year Selector */}
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="px-3 py-1.5 bg-surface-elevated text-xs rounded-lg border border-border"
          >
            <option value={2026}>2026</option>
            <option value={2025}>2025</option>
          </select>

          {/* Download Buttons */}
          <button
            onClick={() => handleDownload('xlsx')}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-elevated hover:bg-surface text-text border border-border text-xs font-semibold rounded-lg shadow-xs transition-colors"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <span>Excel (.xlsx)</span>
          </button>

          <button
            onClick={() => handleDownload('pdf')}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-elevated hover:bg-surface text-text border border-border text-xs font-semibold rounded-lg shadow-xs transition-colors"
          >
            <FileText className="w-4 h-4 text-rose-600" />
            <span>PDF (.pdf)</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-card" />
          ))}
        </div>
      ) : (
        <>
          {/* Summary Stat Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-5 rounded-card bg-surface-elevated border border-border">
              <span className="text-[11px] font-semibold text-text-muted uppercase tracking-wider block">
                Total meals served
              </span>
              <div className="text-2xl font-bold text-text mt-2 flex items-baseline gap-2">
                <span>{report?.totalMeals || 0}</span>
                <span className="text-xs text-text-muted font-normal">meals</span>
              </div>
            </div>

            <div className="p-5 rounded-card bg-surface-elevated border border-border">
              <span className="text-[11px] font-semibold text-text-muted uppercase tracking-wider block">
                Total revenue collected
              </span>
              <div className="text-2xl font-bold text-text mt-2">
                ₹{Number(report?.totalRevenue || 0).toLocaleString('en-IN')}
              </div>
            </div>

            <div className="p-5 rounded-card bg-surface-elevated border border-border">
              <span className="text-[11px] font-semibold text-text-muted uppercase tracking-wider block">
                Plans sold
              </span>
              <div className="text-2xl font-bold text-accent mt-2 flex items-baseline gap-2">
                <span>{report?.plansCount || 0}</span>
                <span className="text-xs text-text-muted font-normal">packages</span>
              </div>
            </div>
          </div>

          {/* Two Columns: Manual Entries by Staff & Daily Meals Breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Manual Entries Breakdown */}
            <div className="p-5 rounded-card bg-surface-elevated border border-border">
              <div className="pb-3 mb-3 border-b border-border">
                <h3 className="font-bold text-sm text-text">Manual entries by staff</h3>
                <span className="text-[11px] text-text-muted">
                  Audit breakdown of manual overrides
                </span>
              </div>

              {!report?.manualByStaff || report.manualByStaff.length === 0 ? (
                <div className="py-8 text-center text-xs text-text-muted">
                  No manual entries recorded during this period.
                </div>
              ) : (
                <div className="divide-y divide-border text-xs">
                  {report.manualByStaff.map((m: any, idx: number) => (
                    <div key={idx} className="py-2.5 flex items-center justify-between">
                      <span className="font-semibold text-text">{m.staff_name}</span>
                      <span className="font-mono font-bold text-warning">{m.count} meals</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Daily Meals Breakdown */}
            <div className="p-5 rounded-card bg-surface-elevated border border-border">
              <div className="pb-3 mb-3 border-b border-border">
                <h3 className="font-bold text-sm text-text">Daily attendance totals</h3>
                <span className="text-[11px] text-text-muted">Meals per calendar day</span>
              </div>

              {!report?.dailyMeals || report.dailyMeals.length === 0 ? (
                <div className="py-8 text-center text-xs text-text-muted">
                  No meals recorded during this period.
                </div>
              ) : (
                <div className="max-h-72 overflow-y-auto divide-y divide-border text-xs">
                  {report.dailyMeals.map((d: any, idx: number) => (
                    <div key={idx} className="py-2 flex items-center justify-between">
                      <span className="font-mono text-text-muted">{d.meal_date}</span>
                      <span className="font-bold text-text">{d.count} meals</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
