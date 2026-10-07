import React, { createContext, useContext, useState, useEffect } from 'react';
import { AdminUser, AdminRole } from '../types';
import { apiRequest } from '../api/client';

export interface LoginResult {
  requires2FA?: boolean;
  user?: AdminUser;
}

interface AuthContextType {
  user: AdminUser | null;
  role: AdminRole | null;
  isOwner: boolean;
  isCounter: boolean;
  isAuthenticated: boolean;
  isLoading: boolean;
  mustChangePassword: boolean;
  login: (email: string, password: string, totpCode?: string) => Promise<LoginResult>;
  logout: () => Promise<void>;
  revokeAllSessions: () => Promise<void>;
  setAuthData: (user: AdminUser, accessToken?: string, refreshToken?: string) => void;
  updateUserPasswordStatus: (mustChange: boolean) => void;
  refreshUserData: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AdminUser | null>(() => {
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('user') : null;
    return saved ? JSON.parse(saved) : null;
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const fetchCurrentUser = async () => {
    try {
      const res = await apiRequest<{ user: AdminUser; mustChangePassword?: boolean; totpEnabled?: boolean }>('/auth/me');
      const updatedUser: AdminUser = {
        ...res.user,
        mustChangePassword: res.mustChangePassword ?? res.user.must_change_password ?? res.user.mustChangePassword,
        totp_enabled: res.totpEnabled ?? res.user.totp_enabled,
      };
      setUser(updatedUser);
      localStorage.setItem('user', JSON.stringify(updatedUser));
    } catch {
      setUser(null);
      localStorage.removeItem('user');
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCurrentUser();
  }, []);

  const setAuthData = (newUser: AdminUser, accessToken?: string, refreshToken?: string) => {
    const formattedUser: AdminUser = {
      ...newUser,
      mustChangePassword: newUser.mustChangePassword ?? newUser.must_change_password ?? true,
    };
    if (accessToken) localStorage.setItem('access_token', accessToken);
    if (refreshToken) localStorage.setItem('refresh_token', refreshToken);
    localStorage.setItem('user', JSON.stringify(formattedUser));
    setUser(formattedUser);
  };

  const updateUserPasswordStatus = (mustChange: boolean) => {
    if (!user) return;
    const updatedUser: AdminUser = {
      ...user,
      must_change_password: mustChange,
      mustChangePassword: mustChange,
    };
    localStorage.setItem('user', JSON.stringify(updatedUser));
    setUser(updatedUser);
  };

  const login = async (email: string, password: string, totpCode?: string): Promise<LoginResult> => {
    const data = await apiRequest<{
      requires2FA?: boolean;
      accessToken?: string;
      refreshToken?: string;
      user?: AdminUser;
      mustChangePassword?: boolean;
      csrfToken?: string;
    }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password, totpCode }),
    });

    if (data.requires2FA) {
      return { requires2FA: true };
    }

    if (data.user) {
      const formattedUser: AdminUser = {
        ...data.user,
        mustChangePassword: data.mustChangePassword ?? data.user.must_change_password ?? data.user.mustChangePassword,
      };

      if (data.accessToken) localStorage.setItem('access_token', data.accessToken);
      if (data.refreshToken) localStorage.setItem('refresh_token', data.refreshToken);
      if (data.csrfToken) localStorage.setItem('csrf_token', data.csrfToken);
      localStorage.setItem('user', JSON.stringify(formattedUser));
      setUser(formattedUser);
      return { user: formattedUser };
    }

    return {};
  };

  const logout = async () => {
    try {
      const refreshToken = localStorage.getItem('refresh_token');
      await apiRequest('/auth/logout', {
        method: 'POST',
        body: JSON.stringify(refreshToken ? { refreshToken } : {}),
      });
    } catch {
      // Ignore logout request errors
    } finally {
      localStorage.clear();
      setUser(null);
      window.location.href = '/login';
    }
  };

  const revokeAllSessions = async () => {
    try {
      await apiRequest('/auth/revoke-all-sessions', { method: 'POST' });
    } finally {
      localStorage.clear();
      setUser(null);
      window.location.href = '/login';
    }
  };

  const mustChangePassword = Boolean(user?.mustChangePassword || user?.must_change_password);

  return (
    <AuthContext.Provider
      value={{
        user,
        role: user?.role || null,
        isOwner: user?.role === 'OWNER',
        isCounter: user?.role === 'COUNTER',
        isAuthenticated: !!user,
        isLoading,
        mustChangePassword,
        login,
        logout,
        revokeAllSessions,
        setAuthData,
        updateUserPasswordStatus,
        refreshUserData: fetchCurrentUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
