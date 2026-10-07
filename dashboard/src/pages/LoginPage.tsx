import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Fingerprint, Lock, Mail, ArrowRight, AlertCircle, ShieldAlert, KeyRound, ArrowLeft } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../api/client';

export const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [requires2FA, setRequires2FA] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [setupRequired, setSetupRequired] = useState(false);

  useEffect(() => {
    // Check if initial owner setup is required
    const checkSetupStatus = async () => {
      try {
        const res = await apiRequest<{ setupRequired: boolean }>('/auth/setup-status');
        if (res.setupRequired) {
          setSetupRequired(true);
        }
      } catch {
        // Ignore check failure, fallback to standard login
      }
    };

    checkSetupStatus();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const result = await login(email, password, requires2FA ? totpCode : undefined);
      if (result.requires2FA) {
        setRequires2FA(true);
      } else {
        navigate('/');
      }
    } catch (err: any) {
      setError(err.message || 'Invalid email or password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-screen flex items-center justify-center p-4 bg-surface">
      <div className="w-full max-w-sm">
        {/* Logo & Heading */}
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-accent text-white flex items-center justify-center mx-auto mb-3 shadow-md">
            <Fingerprint className="w-7 h-7" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-text">Mess tokens</h1>
          <p className="text-xs text-text-muted mt-1">Prepaid canteen administration & counter screen</p>
        </div>

        {/* Setup Banner if First Run */}
        {setupRequired && (
          <div className="mb-4 p-4 rounded-card bg-amber-500/10 border border-amber-500/30 text-xs text-text shadow-sm flex flex-col gap-2">
            <div className="flex items-center gap-2 font-semibold text-amber-500">
              <ShieldAlert className="w-4 h-4 flex-shrink-0" />
              <span>Initial Setup Required</span>
            </div>
            <p className="text-text-muted text-[11px] leading-relaxed">
              No owner administrator account currently exists in the system.
            </p>
            <Link
              to="/setup"
              className="mt-1 py-1.5 px-3 bg-amber-500 hover:bg-amber-600 text-white rounded text-xs font-semibold text-center transition-colors inline-block"
            >
              Start First-Time Setup Wizard &rarr;
            </Link>
          </div>
        )}

        {/* Card */}
        <div className="bg-surface-elevated p-6 rounded-card border border-border shadow-sm">
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-danger-subtle text-danger border border-danger-border flex items-center gap-2 text-xs">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {requires2FA ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="p-3 bg-accent/10 border border-accent/20 rounded-lg text-xs text-text flex items-center gap-2 mb-2">
                <KeyRound className="w-4 h-4 text-accent flex-shrink-0" />
                <span>Enter the 6-digit code from your Authenticator app for <strong>{email}</strong></span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-text mb-1.5">2FA Verification Code</label>
                <input
                  type="text"
                  required
                  maxLength={6}
                  pattern="\d{6}"
                  autoFocus
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="000000"
                  className="w-full text-center tracking-[0.5em] text-lg font-mono py-2.5 bg-surface text-text rounded-lg border border-border focus:border-accent focus:outline-hidden transition-colors"
                />
              </div>

              <button
                type="submit"
                disabled={loading || totpCode.length !== 6}
                className="w-full py-2.5 px-4 bg-accent hover:bg-accent-hover text-white rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading ? <span>Verifying...</span> : <span>Verify & Sign In</span>}
              </button>

              <button
                type="button"
                onClick={() => {
                  setRequires2FA(false);
                  setTotpCode('');
                  setError(null);
                }}
                className="w-full py-1.5 text-text-muted hover:text-text text-xs flex items-center justify-center gap-1 transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to login</span>
              </button>
            </form>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-text mb-1.5">Email address</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@yourmess.com"
                    className="w-full pl-9 pr-3 py-2 bg-surface text-xs rounded-lg border border-border focus:border-accent focus:outline-hidden transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-text mb-1.5">Password</label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-9 pr-3 py-2 bg-surface text-xs rounded-lg border border-border focus:border-accent focus:outline-hidden transition-colors"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full mt-2 py-2.5 px-4 bg-accent hover:bg-accent-hover text-white rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading ? (
                  <span>Signing in...</span>
                ) : (
                  <>
                    <span>Sign in</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
