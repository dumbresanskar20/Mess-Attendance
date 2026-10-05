import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Fingerprint, Lock, Mail, ArrowRight, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await login(email, password);
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Invalid email or password');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickLogin = (demoEmail: string, demoPass: string) => {
    setEmail(demoEmail);
    setPassword(demoPass);
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

        {/* Card */}
        <div className="bg-surface-elevated p-6 rounded-card border border-border shadow-sm">
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-danger-subtle text-danger border border-danger-border flex items-center gap-2 text-xs">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

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
                  placeholder="admin@mess.local"
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

          {/* Demo Presets */}
          <div className="mt-6 pt-5 border-t border-border">
            <span className="text-[11px] font-medium text-text-muted block mb-2 text-center">
              Quick demo accounts
            </span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleQuickLogin('owner@mess.local', 'Owner@123456')}
                className="py-1.5 px-2 bg-surface-subtle hover:bg-surface text-text rounded text-[11px] font-medium border border-border transition-colors text-center"
              >
                Owner Demo
              </button>
              <button
                type="button"
                onClick={() => handleQuickLogin('counter@mess.local', 'Counter@123456')}
                className="py-1.5 px-2 bg-surface-subtle hover:bg-surface text-text rounded text-[11px] font-medium border border-border transition-colors text-center"
              >
                Counter Demo
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
