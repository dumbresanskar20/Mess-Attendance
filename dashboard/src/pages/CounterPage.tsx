import React, { useState, useEffect, useRef } from 'react';
import {
  Fingerprint,
  CheckCircle2,
  XCircle,
  Search,
  AlertTriangle,
  Volume2,
  VolumeX,
  Clock,
  Sparkles,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';
import { useSocket } from '../context/SocketContext';
import { apiRequest } from '../api/client';
import { sound } from '../utils/sound';
import { Badge } from '../components/common/Badge';
import { ScanOutcome, Student, ManualReason } from '../types';

export const CounterPage: React.FC = () => {
  const { latestScan, isDeviceOnline } = useSocket();

  // Active result card state
  const [activeResult, setActiveResult] = useState<ScanOutcome | null>(null);
  const [recentScans, setRecentScans] = useState<ScanOutcome[]>([]);
  const [isMuted, setIsMuted] = useState<boolean>(() => sound.getMuted());

  // Window & served count state
  const [windowInfo, setWindowInfo] = useState<{
    name: string;
    servedCount: number;
  }>({ name: 'Lunch', servedCount: 0 });
  const [mealWindows, setMealWindows] = useState<{ id: number; name: string; start_time: string; end_time: string }[]>([]);
  const [selectedWindowId, setSelectedWindowId] = useState<number | ''>('');

  // Manual marking state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Student[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [manualReason, setManualReason] = useState<ManualReason>('FINGER_NOT_READING');
  const [manualNote, setManualNote] = useState('');
  const [submittingManual, setSubmittingManual] = useState(false);
  const [manualMessage, setManualMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Dev simulation state
  const [allStudents, setAllStudents] = useState<Student[]>([]);
  const [simulatedStudentId, setSimulatedStudentId] = useState<number | string>('');
  const [simulating, setSimulating] = useState(false);

  // Auto-reset timer ref
  const resetTimerRef = useRef<any>(null);

  // Fetch initial window info and all active windows
  const fetchWindowInfo = async () => {
    try {
      const [todayData, windowsData] = await Promise.all([
        apiRequest('/dashboard/today'),
        apiRequest('/meal-windows').catch(() => []),
      ]);
      setWindowInfo({
        name: todayData.activeWindow?.name || 'Lunch',
        servedCount: todayData.metrics?.served?.count || 0,
      });
      if (Array.isArray(windowsData) && windowsData.length > 0) {
        setMealWindows(windowsData);
        setSelectedWindowId((prev) => prev || todayData.activeWindow?.id || windowsData[0].id);
      }
    } catch (e) {}
  };

  // Fetch students for dev simulate panel
  const fetchStudentsForSim = async () => {
    try {
      const res = await apiRequest('/students?limit=50&status=ACTIVE');
      setAllStudents(res.data);
      if (res.data.length > 0 && !simulatedStudentId) {
        setSimulatedStudentId(res.data[0].id);
      }
    } catch (e) {}
  };

  useEffect(() => {
    fetchWindowInfo();
    fetchStudentsForSim();
    const interval = setInterval(fetchWindowInfo, 15000);
    return () => clearInterval(interval);
  }, []);

  // React to incoming scans (from Socket.IO or manual marking)
  useEffect(() => {
    if (latestScan) {
      handleNewScanOutcome(latestScan);
    }
  }, [latestScan]);

  const handleNewScanOutcome = (outcome: ScanOutcome) => {
    setActiveResult(outcome);

    // Play synthesized audio chime
    if (outcome.result === 'APPROVED') {
      sound.playApprove();
      setWindowInfo((prev) => ({ ...prev, servedCount: prev.servedCount + 1 }));
    } else {
      sound.playReject();
    }

    // Add to recent scans list (keep last 5)
    setRecentScans((prev) => [outcome, ...prev.slice(0, 4)]);

    // Clear previous auto-reset timer and start 4-second timeout to return to idle
    if (resetTimerRef.current) {
      clearTimeout(resetTimerRef.current);
    }
    resetTimerRef.current = setTimeout(() => {
      setActiveResult(null);
    }, 4000);
  };

  const toggleSound = () => {
    const muted = sound.toggleMute();
    setIsMuted(muted);
  };

  // Debounced search for manual meal fallback
  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const res = await apiRequest(`/students?search=${encodeURIComponent(searchQuery)}&limit=6`);
        setSearchResults(res.data);
      } catch (e) {
        setSearchResults([]);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Submit manual meal marking
  const handleMarkManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudent) return;

    setSubmittingManual(true);
    setManualMessage(null);

    try {
      const outcome = await apiRequest<ScanOutcome>('/meals/manual', {
        method: 'POST',
        body: JSON.stringify({
          studentId: selectedStudent.id,
          manualReason,
          note: manualNote,
          simulatedWindowId: selectedWindowId || undefined,
        }),
      });

      handleNewScanOutcome(outcome);
      if (outcome.result === 'APPROVED') {
        setSelectedStudent(null);
        setSearchQuery('');
        setManualNote('');
        setManualMessage({
          type: 'success',
          text: `Meal approved for ${outcome.student?.name || selectedStudent.name}. ${outcome.student?.tokensLeft ?? ''} tokens left.`,
        });
      } else {
        setManualMessage({
          type: 'error',
          text: outcome.message || 'Meal rejected for this window.',
        });
      }
    } catch (err: any) {
      setManualMessage({
        type: 'error',
        text: err.message || 'Failed to mark manual meal',
      });
    } finally {
      setSubmittingManual(false);
    }
  };

  // Dev: Simulate Scan (triggers bridge mock scan with HMAC signing)
  const handleSimulateScan = async () => {
    if (!simulatedStudentId) return;
    setSimulating(true);
    try {
      const stu = allStudents.find((s) => String(s.id) === String(simulatedStudentId));
      const deviceUserId = stu ? `${stu.id}_1` : String(simulatedStudentId);

      await fetch('http://localhost:4001/simulate-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceUserId,
          deviceId: 'DEV-COUNTER-01',
        }),
      });
    } catch (err: any) {
      console.error('Bridge simulate scan error:', err);
    } finally {
      setSimulating(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-4 sm:space-y-6">
      {/* Top Banner: Device Offline Alert */}
      {!isDeviceOnline && (
        <div className="p-3 sm:p-3.5 rounded-card bg-danger-subtle text-danger border border-danger-border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 animate-pulse">
          <div className="flex items-center gap-2.5 text-xs font-semibold">
            <ShieldAlert className="w-5 h-5 flex-shrink-0" />
            <span>Device offline. Fingerprint scanner is unreachable. Please use manual marking below.</span>
          </div>
          <Badge variant="danger" className="self-end sm:self-auto">Offline</Badge>
        </div>
      )}

      {/* Header Bar: Meal Window, Served Count, Mute Toggle */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3.5 sm:p-4 rounded-card bg-surface-elevated border border-border">
        <div className="flex flex-wrap items-center gap-3 sm:gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-muted font-medium">Meal window:</span>
            {mealWindows.length > 0 ? (
              <select
                value={selectedWindowId}
                onChange={(e) => setSelectedWindowId(e.target.value ? Number(e.target.value) : '')}
                className="text-xs sm:text-sm font-bold text-text bg-surface-subtle px-2.5 py-1 rounded-md border border-border focus:border-accent focus:outline-hidden"
              >
                {mealWindows.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} ({w.start_time.slice(0, 5)} - {w.end_time.slice(0, 5)})
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-xs sm:text-sm font-bold text-text bg-surface-subtle px-2.5 py-1 rounded-md border border-border">
                {windowInfo.name}
              </span>
            )}
          </div>
          <div className="hidden sm:block h-4 w-[1px] bg-border" />
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-muted font-medium">Meals served today:</span>
            <span className="text-xs sm:text-sm font-bold text-accent">{windowInfo.servedCount}</span>
          </div>
        </div>

        <button
          onClick={toggleSound}
          className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-surface-subtle hover:bg-surface text-xs font-medium text-text-muted hover:text-text transition-colors"
          title={isMuted ? 'Unmute sound chimes' : 'Mute sound chimes'}
        >
          {isMuted ? (
            <>
              <VolumeX className="w-4 h-4 text-danger" />
              <span>Muted</span>
            </>
          ) : (
            <>
              <Volume2 className="w-4 h-4 text-success" />
              <span>Sound on</span>
            </>
          )}
        </button>
      </div>

      {/* Centerpiece: Large Result Card (Approved / Rejected / Idle) */}
      <div className="min-h-[240px] sm:min-h-[290px] flex items-center justify-center">
        {!activeResult ? (
          /* Idle State */
          <div className="w-full p-10 rounded-card bg-surface-elevated border border-border text-center flex flex-col items-center justify-center space-y-4">
            <div className="w-20 h-20 rounded-full bg-surface-subtle text-accent flex items-center justify-center border border-border shadow-inner">
              <Fingerprint className="w-10 h-10 animate-pulse text-accent" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-text">Waiting for fingerprint</h2>
              <p className="text-xs text-text-muted mt-1">
                Place finger on the reader to deduct token automatically
              </p>
            </div>
          </div>
        ) : activeResult.result === 'APPROVED' ? (
          /* Approved State */
          <div className="w-full p-4 sm:p-8 rounded-card bg-success-subtle border-2 border-success text-text shadow-lg animate-in zoom-in-95 duration-150">
            <div className="flex flex-col md:flex-row items-center md:items-start gap-4 sm:gap-6">
              {/* Photo */}
              <div className="w-20 h-20 sm:w-28 sm:h-28 rounded-xl bg-surface-elevated border-2 border-success-border overflow-hidden flex-shrink-0 shadow-md">
                <img
                  src={
                    activeResult.student?.photoPath ||
                    `https://api.dicebear.com/7.x/avataaars/svg?seed=${activeResult.student?.studentCode}`
                  }
                  alt={activeResult.student?.name || 'Student'}
                  className="w-full h-full object-cover"
                />
              </div>

              {/* Details */}
              <div className="flex-1 text-center md:text-left space-y-2">
                <div className="flex items-center justify-center md:justify-start gap-2">
                  <CheckCircle2 className="w-5 h-5 sm:w-6 sm:h-6 text-success flex-shrink-0" />
                  <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-success">
                    Meal Approved &bull; {activeResult.method}
                  </span>
                </div>

                <h2 className="text-xl sm:text-2xl font-bold text-text tracking-tight">
                  {activeResult.student?.name}
                </h2>
                <div className="text-xs font-mono text-text-muted">
                  {activeResult.student?.studentCode} &bull; {activeResult.student?.planName}
                </div>

                <div className="pt-2 sm:pt-3 flex flex-wrap items-center justify-center md:justify-start gap-2 sm:gap-3">
                  <div className="px-3 py-1.5 rounded-lg bg-surface-elevated border border-success-border shadow-xs">
                    <span className="text-[10px] text-text-muted uppercase block font-semibold">
                      Tokens left
                    </span>
                    <span className="text-base sm:text-lg font-black text-success">
                      {activeResult.student?.tokensLeft}
                    </span>
                  </div>

                  <div className="px-3 py-1.5 rounded-lg bg-surface-elevated border border-success-border shadow-xs">
                    <span className="text-[10px] text-text-muted uppercase block font-semibold">
                      Plan valid until
                    </span>
                    <span className="text-xs font-bold text-text">
                      {activeResult.student?.planEndDate}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Rejected State */
          <div className="w-full p-4 sm:p-8 rounded-card bg-danger-subtle border-2 border-danger text-text shadow-lg animate-in zoom-in-95 duration-150">
            <div className="flex flex-col md:flex-row items-center md:items-start gap-4 sm:gap-6">
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-danger/10 text-danger border-2 border-danger-border flex items-center justify-center flex-shrink-0">
                <XCircle className="w-10 h-10 sm:w-12 sm:h-12" />
              </div>

              <div className="flex-1 text-center md:text-left space-y-2">
                <div className="flex items-center justify-center md:justify-start gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-danger">
                    Meal Rejected &bull; {activeResult.rejectReason?.replace('_', ' ')}
                  </span>
                </div>

                {activeResult.student?.name && (
                  <h2 className="text-xl font-bold text-text">
                    {activeResult.student.name} ({activeResult.student.studentCode})
                  </h2>
                )}

                <p className="text-base font-semibold text-danger pt-1">
                  {activeResult.message}
                </p>

                <p className="text-xs text-text-muted pt-2">
                  Please verify subscription or use manual marking below if fingerprint is unreadable.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Row 2: Manual Fallback Panel + Recent Scans */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Manual Fallback Panel */}
        <div className="p-5 rounded-card bg-surface-elevated border border-border">
          <div className="mb-4 pb-3 border-b border-border">
            <h3 className="font-bold text-sm text-text">
              Fingerprint not reading? Mark meal manually
            </h3>
            <p className="text-[11px] text-text-muted mt-0.5">
              Same rules as a scan. Logged with your staff credentials and timestamp.
            </p>
          </div>

          {manualMessage && (
            <div
              className={`mb-4 p-2.5 rounded text-xs font-medium border flex items-center gap-2 ${
                manualMessage.type === 'success'
                  ? 'bg-success-subtle text-success border-success-border'
                  : 'bg-danger-subtle text-danger border-danger-border'
              }`}
            >
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>{manualMessage.text}</span>
            </div>
          )}

          <form onSubmit={handleMarkManual} className="space-y-4">
            {/* Student Search */}
            <div className="relative">
              <label className="block text-xs font-semibold text-text mb-1">
                Find student
              </label>
              <div className="relative">
                <Search className="w-4 h-4 text-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    if (selectedStudent) setSelectedStudent(null);
                  }}
                  placeholder="Search by student name, code, or phone..."
                  className="w-full pl-9 pr-3 py-2 bg-surface text-xs rounded-lg border border-border focus:border-accent focus:outline-hidden"
                />
              </div>

              {/* Autocomplete Dropdown */}
              {searchResults.length > 0 && !selectedStudent && (
                <div className="absolute left-0 right-0 mt-1 bg-surface-elevated border border-border rounded-lg shadow-lg z-20 max-h-48 overflow-y-auto divide-y divide-border">
                  {searchResults.map((s) => (
                    <div
                      key={s.id}
                      onClick={() => {
                        setSelectedStudent(s);
                        setSearchQuery(`${s.name} (${s.student_code})`);
                        setSearchResults([]);
                      }}
                      className="p-2.5 hover:bg-surface-subtle cursor-pointer flex items-center justify-between text-xs transition-colors"
                    >
                      <div>
                        <span className="font-semibold block">{s.name}</span>
                        <span className="text-[10px] text-text-muted font-mono">
                          {s.student_code} &bull; {s.phone}
                        </span>
                      </div>
                      <Badge variant={s.tokens_left > 0 ? 'success' : 'danger'}>
                        {s.tokens_left} tokens left
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Selected Student Confirmation Pill */}
            {selectedStudent && (
              <div className="p-2.5 rounded-lg bg-surface-subtle border border-border flex items-center justify-between text-xs">
                <div>
                  <span className="font-bold text-text block">{selectedStudent.name}</span>
                  <span className="text-[10px] text-text-muted font-mono">
                    {selectedStudent.student_code}
                  </span>
                </div>
                <div className="text-right">
                  <span className="font-bold text-accent block">
                    {selectedStudent.tokens_left} tokens
                  </span>
                  <span className="text-[10px] text-text-muted">
                    {selectedStudent.active_plan || 'Active plan'}
                  </span>
                </div>
              </div>
            )}

            {/* Reason Dropdown (Mandatory) */}
            <div>
              <label className="block text-xs font-semibold text-text mb-1">
                Mandatory reason
              </label>
              <select
                value={manualReason}
                onChange={(e) => setManualReason(e.target.value as ManualReason)}
                className="w-full px-3 py-2 bg-surface text-xs rounded-lg border border-border focus:border-accent focus:outline-hidden"
              >
                <option value="FINGER_NOT_READING">Finger not reading / sensor dry</option>
                <option value="WET_OR_OILY_FINGER">Wet or oily finger</option>
                <option value="DEVICE_DOWN">Device down / hardware offline</option>
                <option value="INJURY">Injury / bandage on finger</option>
                <option value="OTHER">Other exception</option>
              </select>
            </div>

            {/* Optional Note */}
            <div>
              <label className="block text-xs font-semibold text-text mb-1">
                Optional note
              </label>
              <input
                type="text"
                value={manualNote}
                onChange={(e) => setManualNote(e.target.value)}
                placeholder="Additional notes for audit trail..."
                className="w-full px-3 py-2 bg-surface text-xs rounded-lg border border-border focus:border-accent focus:outline-hidden"
              />
            </div>

            <button
              type="submit"
              disabled={!selectedStudent || submittingManual}
              className="w-full py-2.5 px-4 bg-accent hover:bg-accent-hover text-white rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <span>Mark meal</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>

        {/* Recent 5 Scans List */}
        <div className="p-5 rounded-card bg-surface-elevated border border-border flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-border">
              <h3 className="font-bold text-sm text-text">Recent scans</h3>
              <span className="text-[11px] text-text-muted">Last 5 outcomes</span>
            </div>

            {recentScans.length === 0 ? (
              <div className="py-12 text-center text-xs text-text-muted">
                No recent scans during this session.
              </div>
            ) : (
              <div className="divide-y divide-border">
                {recentScans.map((scan, idx) => {
                  const isApproved = scan.result === 'APPROVED';
                  const isManual = scan.method === 'MANUAL';
                  return (
                    <div
                      key={idx}
                      className="py-2.5 flex items-center justify-between text-xs"
                    >
                      <div>
                        <span className="font-semibold block">
                          {scan.student?.name || 'Unknown student'}
                        </span>
                        <span className="text-[10px] text-text-muted font-mono">
                          {scan.student?.studentCode || 'No match'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={isManual ? 'warning' : 'accent'}>
                          {isManual ? 'Manual' : 'Finger'}
                        </Badge>
                        <Badge variant={isApproved ? 'success' : 'danger'}>
                          {isApproved
                            ? 'Approved'
                            : scan.rejectReason?.replace('_', ' ') || 'Rejected'}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Dev Simulate Scan Panel (Section 4 & 9.3) */}
          <div className="mt-4 pt-4 border-t border-border">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold text-accent uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                Dev: Simulate fingerprint scan
              </span>
              <span className="text-[10px] text-text-muted">MockDevice driver</span>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <select
                value={simulatedStudentId}
                onChange={(e) => setSimulatedStudentId(e.target.value)}
                className="flex-1 px-2.5 py-1.5 bg-surface text-xs rounded border border-border focus:border-accent focus:outline-hidden"
              >
                {allStudents.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.student_code}) &bull; {s.tokens_left} tokens
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={handleSimulateScan}
                disabled={simulating || !simulatedStudentId}
                className="px-3 py-1.5 bg-accent hover:bg-accent-hover text-white rounded text-xs font-semibold transition-colors disabled:opacity-50 text-center"
              >
                {simulating ? 'Scanning...' : 'Scan finger'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
