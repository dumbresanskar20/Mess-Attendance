import React, { useState, useEffect } from 'react';
import {
  Fingerprint,
  CheckCircle2,
  AlertOctagon,
  Laptop,
  Cpu,
  RefreshCw,
  Loader2,
  ShieldCheck,
  X,
} from 'lucide-react';
import {
  checkBiometricAvailability,
  captureInbuiltFingerprint,
  captureExternalFingerprint,
  BiometricAvailability,
  BiometricCaptureResult,
} from '../../utils/biometrics';

interface FingerprintScanModalProps {
  isOpen: boolean;
  onClose: () => void;
  studentName: string;
  studentCode: string;
  fingerLabel?: string;
  onSuccess: (result: BiometricCaptureResult) => void;
}

export const FingerprintScanModal: React.FC<FingerprintScanModalProps> = ({
  isOpen,
  onClose,
  studentName,
  studentCode,
  fingerLabel = 'Right index',
  onSuccess,
}) => {
  const [selectedFinger, setSelectedFinger] = useState(fingerLabel);
  const [loadingCheck, setLoadingCheck] = useState(true);
  const [availability, setAvailability] = useState<BiometricAvailability | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanSuccess, setScanSuccess] = useState<BiometricCaptureResult | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);

  // Check hardware availability whenever modal opens
  const refreshHardware = async () => {
    setLoadingCheck(true);
    setScanError(null);
    try {
      const avail = await checkBiometricAvailability();
      setAvailability(avail);
    } catch (e: any) {
      setScanError('Failed to inspect biometric hardware: ' + e.message);
    } finally {
      setLoadingCheck(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setScanSuccess(null);
      setScanError(null);
      setSelectedFinger(fingerLabel);
      refreshHardware();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleStartScan = async () => {
    if (!availability) return;
    setScanning(true);
    setScanError(null);

    try {
      if (availability.externalAvailable) {
        // Capture from External Hardware Scanner
        const result = await captureExternalFingerprint(
          `ext_${studentCode.replace(/[^a-zA-Z0-9]/g, '_')}`,
          selectedFinger
        );
        setScanSuccess(result);
        setTimeout(() => onSuccess(result), 800);
      } else if (availability.inbuiltAvailable) {
        // Capture from Device Inbuilt Sensor (Touch ID / Windows Hello)
        const result = await captureInbuiltFingerprint(
          studentCode,
          studentName,
          selectedFinger
        );
        setScanSuccess(result);
        setTimeout(() => onSuccess(result), 800);
      } else {
        throw new Error(
          'No biometric hardware available. Registration cannot proceed without fingerprint scan.'
        );
      }
    } catch (err: any) {
      setScanError(err.message || 'Fingerprint scan failed. Please try again.');
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-surface-elevated border border-border rounded-2xl w-full max-w-md max-h-[92vh] flex flex-col overflow-hidden shadow-2xl animate-scale-up">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-border bg-surface-subtle flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-accent/10 text-accent">
              <Fingerprint className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h3 className="text-xs sm:text-sm font-bold text-text">Biometric Fingerprint Registration</h3>
              <p className="text-[10px] sm:text-[11px] text-text-muted">
                {studentName} ({studentCode})
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={scanning}
            className="p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-surface transition-colors disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-6 space-y-4 sm:space-y-5 overflow-y-auto">
          {/* Finger Choice Selector */}
          <div>
            <label className="block text-xs font-semibold text-text-muted mb-1.5">
              Select finger being enrolled
            </label>
            <select
              value={selectedFinger}
              onChange={(e) => setSelectedFinger(e.target.value)}
              disabled={scanning || !!scanSuccess}
              className="w-full px-3 py-2 bg-surface text-xs rounded-lg border border-border focus:border-accent focus:outline-hidden text-text font-medium"
            >
              <option value="Right index">Right index</option>
              <option value="Right thumb">Right thumb</option>
              <option value="Left index">Left index</option>
              <option value="Left thumb">Left thumb</option>
              <option value="Right middle">Right middle</option>
              <option value="Left middle">Left middle</option>
            </select>
          </div>

          {/* Hardware Detection Status Card */}
          {loadingCheck ? (
            <div className="p-4 rounded-xl border border-border bg-surface flex items-center justify-center gap-2 text-xs text-text-muted">
              <Loader2 className="w-4 h-4 animate-spin text-accent" />
              <span>Checking biometric scanner hardware...</span>
            </div>
          ) : availability ? (
            <div className="space-y-3">
              <div
                className={`p-3.5 rounded-xl border text-xs flex items-start gap-3 ${
                  availability.primaryMethod === 'EXTERNAL'
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                    : availability.primaryMethod === 'INBUILT'
                    ? 'bg-accent/10 border-accent/30 text-accent'
                    : 'bg-danger/10 border-danger/30 text-danger'
                }`}
              >
                {availability.primaryMethod === 'EXTERNAL' ? (
                  <Cpu className="w-5 h-5 flex-shrink-0 text-emerald-400 mt-0.5" />
                ) : availability.primaryMethod === 'INBUILT' ? (
                  <Laptop className="w-5 h-5 flex-shrink-0 text-accent mt-0.5" />
                ) : (
                  <AlertOctagon className="w-5 h-5 flex-shrink-0 text-danger mt-0.5" />
                )}
                <div className="flex-1">
                  <div className="font-bold flex items-center justify-between">
                    <span>
                      {availability.primaryMethod === 'EXTERNAL'
                        ? 'External Scanner Connected'
                        : availability.primaryMethod === 'INBUILT'
                        ? 'Device Inbuilt Sensor Detected'
                        : 'No Fingerprint Scanner Found'}
                    </span>
                    <button
                      onClick={refreshHardware}
                      disabled={scanning}
                      title="Re-check hardware"
                      className="text-[10px] text-text-muted hover:text-text underline flex items-center gap-1"
                    >
                      <RefreshCw className="w-3 h-3" /> Re-check
                    </button>
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed opacity-90">
                    {availability.message}
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          {/* Visual Scanner Area */}
          <div className="py-5 flex flex-col items-center justify-center rounded-2xl bg-surface border border-border/60 relative overflow-hidden">
            {scanSuccess ? (
              <div className="flex flex-col items-center text-center space-y-2 text-emerald-400 animate-scale-up">
                <div className="p-4 rounded-full bg-emerald-500/20 text-emerald-400">
                  <CheckCircle2 className="w-12 h-12" />
                </div>
                <h4 className="text-sm font-bold text-text">Fingerprint Verified!</h4>
                <p className="text-[11px] text-text-muted">{scanSuccess.details}</p>
              </div>
            ) : scanning ? (
              <div className="flex flex-col items-center text-center space-y-3">
                <div className="relative">
                  <div className="absolute inset-0 rounded-full bg-accent/20 animate-ping" />
                  <div className="p-4 rounded-full bg-accent/20 text-accent relative">
                    <Fingerprint className="w-12 h-12 animate-pulse" />
                  </div>
                </div>
                <div>
                  <h4 className="text-xs font-bold text-text">
                    {availability?.primaryMethod === 'EXTERNAL'
                      ? 'Place finger on external scanner...'
                      : 'Touch your device fingerprint sensor now (Touch ID)...'}
                  </h4>
                  <p className="text-[11px] text-text-muted mt-0.5">
                    Awaiting biometric sensor input
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center text-center space-y-3">
                <div className="p-4 rounded-full bg-surface-subtle border border-border text-text-muted">
                  <Fingerprint className="w-12 h-12" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-text">
                    {availability?.primaryMethod === 'NONE'
                      ? 'Biometric Sensor Required'
                      : 'Ready to Scan Fingerprint'}
                  </h4>
                  <p className="text-[11px] text-text-muted max-w-xs mt-0.5">
                    {availability?.primaryMethod === 'NONE'
                      ? 'Student cannot be registered without fingerprint registration. Please connect an external scanner or use a device with inbuilt Touch ID.'
                      : availability?.primaryMethod === 'EXTERNAL'
                      ? 'Click the button below to initiate capture from the external biometric scanner terminal.'
                      : 'Click the button below to trigger your laptop/device Touch ID biometric prompt.'}
                  </p>
                </div>
              </div>
            )}

            {/* Error Message */}
            {scanError && (
              <div className="mt-3 px-4 py-2 mx-4 rounded-lg bg-danger/10 border border-danger/30 text-danger text-[11px] text-center font-medium">
                {scanError}
              </div>
            )}
          </div>

          {/* Action Footer Buttons */}
          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={scanning}
              className="px-4 py-2 rounded-xl border border-border text-xs font-semibold text-text-muted hover:text-text hover:bg-surface transition-colors"
            >
              Cancel Registration
            </button>

            {availability?.primaryMethod !== 'NONE' ? (
              <button
                type="button"
                onClick={handleStartScan}
                disabled={scanning || !!scanSuccess || loadingCheck}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-accent hover:bg-accent-hover text-white text-xs font-bold shadow-md shadow-accent/20 transition-all disabled:opacity-50"
              >
                {scanning ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Scanning Sensor...</span>
                  </>
                ) : scanSuccess ? (
                  <>
                    <ShieldCheck className="w-4 h-4 text-emerald-300" />
                    <span>Enrolled! Saving...</span>
                  </>
                ) : (
                  <>
                    <Fingerprint className="w-4 h-4" />
                    <span>
                      {availability?.primaryMethod === 'EXTERNAL'
                        ? 'Scan External Fingerprint'
                        : 'Scan Inbuilt Fingerprint (Touch ID)'}
                    </span>
                  </>
                )}
              </button>
            ) : (
              <button
                type="button"
                disabled
                className="px-4 py-2.5 rounded-xl bg-surface border border-danger/40 text-danger text-xs font-bold cursor-not-allowed opacity-75"
              >
                Registration Blocked (No Fingerprint)
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
