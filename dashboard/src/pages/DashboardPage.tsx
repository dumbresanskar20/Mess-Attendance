import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Utensils,
  Users,
  IndianRupee,
  AlertTriangle,
  RotateCcw,
  Clock,
  ChevronRight,
  TrendingUp,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { apiRequest } from '../api/client';
import { useSocket } from '../context/SocketContext';
import { Badge } from '../components/common/Badge';
import { Skeleton } from '../components/common/Skeleton';
import {
  DashboardMetrics,
  WeeklyChartData,
  DashboardAlerts,
  MealLogItem,
} from '../types';

export const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { latestScan } = useSocket();

  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [weeklyData, setWeeklyData] = useState<WeeklyChartData[]>([]);
  const [liveScans, setLiveScans] = useState<MealLogItem[]>([]);
  const [alerts, setAlerts] = useState<DashboardAlerts | null>(null);

  const [loadingMetrics, setLoadingMetrics] = useState(true);
  const [loadingWeekly, setLoadingWeekly] = useState(true);
  const [loadingLive, setLoadingLive] = useState(true);
  const [loadingAlerts, setLoadingAlerts] = useState(true);

  const [error, setError] = useState<string | null>(null);

  // Fetch Dashboard Metrics
  const fetchMetrics = async () => {
    try {
      const data = await apiRequest<DashboardMetrics>('/dashboard/today');
      setMetrics(data);
    } catch (e: any) {
      setError(e.message || 'Failed to load today metrics');
    } finally {
      setLoadingMetrics(false);
    }
  };

  // Fetch Weekly Chart Data
  const fetchWeekly = async () => {
    try {
      const data = await apiRequest<WeeklyChartData[]>('/dashboard/weekly');
      setWeeklyData(data);
    } catch (e) {
    } finally {
      setLoadingWeekly(false);
    }
  };

  // Fetch Live Scans
  const fetchLiveScans = async () => {
    try {
      const data = await apiRequest<MealLogItem[]>('/dashboard/live');
      setLiveScans(data);
    } catch (e) {
    } finally {
      setLoadingLive(false);
    }
  };

  // Fetch Alerts
  const fetchAlerts = async () => {
    try {
      const data = await apiRequest<DashboardAlerts>('/dashboard/alerts');
      setAlerts(data);
    } catch (e) {
    } finally {
      setLoadingAlerts(false);
    }
  };

  const loadAll = () => {
    setError(null);
    fetchMetrics();
    fetchWeekly();
    fetchLiveScans();
    fetchAlerts();
  };

  useEffect(() => {
    loadAll();
    const interval = setInterval(fetchMetrics, 30000);
    return () => clearInterval(interval);
  }, []);

  // Real-time scan incoming via Socket.IO
  useEffect(() => {
    if (latestScan) {
      // Re-fetch metrics and live scans when a scan occurs
      fetchMetrics();
      fetchLiveScans();
    }
  }, [latestScan]);

  const formatISTTime = (isoString: string) => {
    try {
      return new Date(isoString).toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
        timeZone: 'Asia/Kolkata',
      });
    } catch (e) {
      return isoString;
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Error Banner with Retry */}
      {error && (
        <div className="p-4 rounded-card bg-danger-subtle text-danger border border-danger-border flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-medium">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={loadAll}
            className="flex items-center gap-1.5 px-3 py-1 bg-surface-elevated text-xs font-semibold rounded border border-danger-border hover:bg-surface transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Retry</span>
          </button>
        </div>
      )}

      {/* Row 1: Four Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Served Count */}
        <div className="p-5 rounded-card bg-surface-elevated border border-border">
          <div className="flex items-center justify-between text-text-muted mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">
              {metrics?.metrics?.served?.label || 'Meals served'}
            </span>
            <div className="p-2 rounded-lg bg-accent/10 text-accent">
              <Utensils className="w-4 h-4" />
            </div>
          </div>
          {loadingMetrics ? (
            <Skeleton className="h-8 w-24 my-1" />
          ) : (
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold tracking-tight text-text">
                {metrics?.metrics?.served?.count ?? 0}
              </span>
              <span className="text-xs text-text-muted font-medium">
                / {metrics?.metrics?.served?.total ?? 0} active
              </span>
            </div>
          )}
          <span className="text-[11px] text-text-muted mt-2 block">
            Current window: {metrics?.activeWindow?.name || 'Lunch'}
          </span>
        </div>

        {/* Card 2: Expected Count */}
        <div className="p-5 rounded-card bg-surface-elevated border border-border">
          <div className="flex items-center justify-between text-text-muted mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">
              {metrics?.metrics?.expected?.label || 'Dinner expected'}
            </span>
            <div className="p-2 rounded-lg bg-surface-subtle text-text-muted">
              <Users className="w-4 h-4" />
            </div>
          </div>
          {loadingMetrics ? (
            <Skeleton className="h-8 w-16 my-1" />
          ) : (
            <div className="text-2xl font-bold tracking-tight text-text">
              {metrics?.metrics?.expected?.count ?? 0}
            </div>
          )}
          <span className="text-[11px] text-text-muted mt-2 block">
            Students with active meal plans
          </span>
        </div>

        {/* Card 3: Revenue Today */}
        <div className="p-5 rounded-card bg-surface-elevated border border-border">
          <div className="flex items-center justify-between text-text-muted mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">
              {metrics?.metrics?.revenue?.label || 'Revenue today'}
            </span>
            <div className="p-2 rounded-lg bg-success-subtle text-success">
              <IndianRupee className="w-4 h-4" />
            </div>
          </div>
          {loadingMetrics ? (
            <Skeleton className="h-8 w-24 my-1" />
          ) : (
            <div className="text-2xl font-bold tracking-tight text-text">
              ₹{Number(metrics?.metrics?.revenue?.amount || 0).toLocaleString('en-IN')}
            </div>
          )}
          <span className="text-[11px] text-text-muted mt-2 block">
            From new plans and recharges today
          </span>
        </div>

        {/* Card 4: Manual Entries (Warning if > 10%) */}
        <div
          className={`p-5 rounded-card border transition-colors ${
            metrics?.metrics?.manualEntries?.isHighAlert
              ? 'bg-warning-subtle text-warning border-warning-border'
              : 'bg-surface-elevated border-border'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">
              {metrics?.metrics?.manualEntries?.label || 'Manual entries'}
            </span>
            <div
              className={`p-2 rounded-lg ${
                metrics?.metrics?.manualEntries?.isHighAlert
                  ? 'bg-warning/20 text-warning'
                  : 'bg-surface-subtle text-text-muted'
              }`}
            >
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          {loadingMetrics ? (
            <Skeleton className="h-8 w-20 my-1" />
          ) : (
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold tracking-tight">
                {metrics?.metrics?.manualEntries?.count ?? 0}
              </span>
              <span className="text-xs font-medium">
                ({metrics?.metrics?.manualEntries?.sharePercent ?? 0}%)
              </span>
            </div>
          )}
          <span className="text-[11px] mt-2 block">
            {metrics?.metrics?.manualEntries?.isHighAlert
              ? 'High manual rate (>10%) — check scanner'
              : 'Normal rate (fingerprint reading well)'}
          </span>
        </div>
      </div>

      {/* Row 2: Live Scans Panel + 7-Day Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Live Scans Panel */}
        <div className="p-5 rounded-card bg-surface-elevated border border-border flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-border">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-accent" />
                <h3 className="font-bold text-sm text-text">Live scans</h3>
              </div>
              <span className="text-[11px] text-text-muted font-medium flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-success animate-ping" />
                Live socket stream
              </span>
            </div>

            {loadingLive ? (
              <div className="space-y-3">
                {[...Array(6)].map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : liveScans.length === 0 ? (
              <div className="py-12 text-center text-xs text-text-muted">
                No scans yet. Scans appear here as students eat.
              </div>
            ) : (
              <div className="divide-y divide-border">
                {liveScans.map((scan) => {
                  const isApproved = scan.result === 'APPROVED';
                  const isManual = scan.method === 'MANUAL';
                  return (
                    <div
                      key={scan.id}
                      className="py-2.5 flex items-center justify-between text-xs hover:bg-surface-subtle/50 px-1 rounded transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-[11px] text-text-muted">
                          {formatISTTime(scan.created_at)}
                        </span>
                        <div>
                          <span className="font-semibold text-text block">
                            {scan.student_name || 'Unknown student'}
                          </span>
                          <span className="text-[10px] text-text-muted font-mono">
                            {scan.student_code || scan.window_name}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Badge variant={isManual ? 'warning' : 'accent'}>
                          {isManual ? 'Manual' : 'Finger'}
                        </Badge>
                        <Badge variant={isApproved ? 'success' : 'danger'}>
                          {isApproved
                            ? 'Approved'
                            : scan.reject_reason?.replace('_', ' ') || 'Rejected'}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div className="mt-4 pt-3 border-t border-border flex justify-end">
            <button
              onClick={() => navigate('/meals')}
              className="text-xs font-semibold text-accent hover:text-accent-hover flex items-center gap-1"
            >
              <span>View full meal log</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* 7-Day Chart Panel */}
        <div className="p-5 rounded-card bg-surface-elevated border border-border flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-border">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-accent" />
                <h3 className="font-bold text-sm text-text">Meals served, last 7 days</h3>
              </div>
              <span className="text-[11px] text-text-muted">Daily lunch & dinner breakdown</span>
            </div>

            {loadingWeekly ? (
              <div className="h-64 flex items-center justify-center">
                <Skeleton className="h-56 w-full" />
              </div>
            ) : weeklyData.length === 0 ? (
              <div className="h-64 flex items-center justify-center text-xs text-text-muted">
                No meal data recorded for the past 7 days.
              </div>
            ) : (
              <div className="h-64 w-full text-xs">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={weeklyData}
                    margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.2} />
                    <XAxis
                      dataKey="day"
                      tickLine={false}
                      axisLine={false}
                      fontSize={11}
                      tick={{ fill: 'var(--color-text-muted)' }}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      fontSize={11}
                      tick={{ fill: 'var(--color-text-muted)' }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'var(--color-surface-elevated)',
                        borderColor: 'var(--color-border)',
                        borderRadius: '8px',
                        fontSize: '12px',
                        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                      }}
                    />
                    <Legend
                      verticalAlign="top"
                      align="right"
                      iconSize={8}
                      iconType="circle"
                      wrapperStyle={{ paddingBottom: '10px', fontSize: '11px' }}
                    />
                    <Bar
                      dataKey="lunch"
                      name="Lunch"
                      fill="#8b5cf6"
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar
                      dataKey="dinner"
                      name="Dinner"
                      fill="#14b8a6"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Row 3: Alert Lists (Low Balance & Expiring Plans) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Low Balance Alert List */}
        <div className="p-5 rounded-card bg-surface-elevated border border-border">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-border">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-warning" />
              <h3 className="font-bold text-sm text-text">Low balance</h3>
            </div>
            <span className="text-[11px] font-semibold text-warning bg-warning-subtle px-2 py-0.5 rounded border border-warning-border">
              {alerts?.lowBalance?.length || 0} students with &le; 4 tokens
            </span>
          </div>

          {loadingAlerts ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : !alerts?.lowBalance || alerts.lowBalance.length === 0 ? (
            <div className="py-8 text-center text-xs text-text-muted">
              All students currently have adequate tokens.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {alerts.lowBalance.map((item) => (
                <div
                  key={item.id}
                  onClick={() => navigate(`/students/${item.id}`)}
                  className="py-2.5 flex items-center justify-between text-xs hover:bg-surface-subtle px-2 rounded cursor-pointer transition-colors"
                >
                  <div>
                    <span className="font-semibold text-text block">{item.name}</span>
                    <span className="text-[10px] text-text-muted font-mono">
                      {item.student_code}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="warning">
                      {item.tokens_left} {item.tokens_left === 1 ? 'token' : 'tokens'} left
                    </Badge>
                    <ChevronRight className="w-3.5 h-3.5 text-text-muted" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Plans Expiring This Week */}
        <div className="p-5 rounded-card bg-surface-elevated border border-border">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-border">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-accent" />
              <h3 className="font-bold text-sm text-text">Plans expiring this week</h3>
            </div>
            <span className="text-[11px] font-semibold text-accent bg-accent-subtle px-2 py-0.5 rounded border border-accent/30">
              {alerts?.expiringPlans?.length || 0} plans ending soon
            </span>
          </div>

          {loadingAlerts ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : !alerts?.expiringPlans || alerts.expiringPlans.length === 0 ? (
            <div className="py-8 text-center text-xs text-text-muted">
              No plans expiring within the next 7 days.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {alerts.expiringPlans.map((item) => (
                <div
                  key={item.student_id}
                  onClick={() => navigate(`/students/${item.student_id}`)}
                  className="py-2.5 flex items-center justify-between text-xs hover:bg-surface-subtle px-2 rounded cursor-pointer transition-colors"
                >
                  <div>
                    <span className="font-semibold text-text block">{item.student_name}</span>
                    <span className="text-[10px] text-text-muted">
                      {item.plan_name} &bull; {item.student_code}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="accent">Expires {item.end_date}</Badge>
                    <ChevronRight className="w-3.5 h-3.5 text-text-muted" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
