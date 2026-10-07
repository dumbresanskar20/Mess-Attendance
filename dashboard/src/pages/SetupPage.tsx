import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, User, Mail, Lock, ArrowRight, AlertCircle, CheckCircle } from 'lucide-react';
import { apiRequest } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { AdminUser } from '../types';

export const SetupPage: React.FC = () => {
  const navigate = useNavigate();
  const { setAuthData } = useAuth();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('Password must be at least 8 characters long');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);

    try {
      const data = await apiRequest<{
        accessToken: string;
        refreshToken: string;
        user: AdminUser;
        mustChangePassword?: boolean;
      }>('/auth/initial-setup', {
        method: 'POST',
        body: JSON.stringify({ name, email, password }),
      });

      setAuthData(data.user, data.accessToken, data.refreshToken);
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Failed to complete initial setup');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-screen flex items-center justify-center p-4 bg-surface">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-accent text-white flex items-center justify-center mx-auto mb-3 shadow-md">
            <ShieldCheck className="w-7 h-7" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-text">First-Time Setup</h1>
          <p className="text-xs text-text-muted mt-1">
            Create the primary Owner administrator account for Mess tokens
          </p>
        </div>

        {/* Setup Form Card */}
        <div className="bg-surface-elevated p-6 rounded-card border border-border shadow-sm">
          <div className="mb-5 p-3 rounded-lg bg-surface-subtle border border-border text-xs text-text-muted flex items-start gap-2">
            <CheckCircle className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" />
            <span>
              Welcome! No active owner account was detected. Please configure the initial administrator credentials.
            </span>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-danger-subtle text-danger border border-danger-border flex items-center gap-2 text-xs">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-text mb-1.5">Owner Full Name</label>
              <div className="relative">
                <User className="w-4 h-4 text-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Rahul Sharma"
                  className="w-full pl-9 pr-3 py-2 bg-surface text-xs rounded-lg border border-border focus:border-accent focus:outline-hidden transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-text mb-1.5">Owner Email Address</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="owner@yourmess.com"
                  className="w-full pl-9 pr-3 py-2 bg-surface text-xs rounded-lg border border-border focus:border-accent focus:outline-hidden transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-text mb-1.5">Temporary Initial Password</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  className="w-full pl-9 pr-3 py-2 bg-surface text-xs rounded-lg border border-border focus:border-accent focus:outline-hidden transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-text mb-1.5">Confirm Password</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  required
                  minLength={8}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat temporary password"
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
                <span>Initializing Owner...</span>
              ) : (
                <>
                  <span>Create Owner & Continue</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
