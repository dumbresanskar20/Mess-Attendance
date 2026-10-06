import React, { useState, useEffect } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  ScanLine,
  Users,
  CreditCard,
  History,
  FileBarChart,
  ShieldCheck,
  LogOut,
  Moon,
  Sun,
  Fingerprint,
  Wifi,
  WifiOff,
  Menu,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';

export const AppLayout: React.FC = () => {
  const { user, isOwner, logout } = useAuth();
  const { isDeviceOnline } = useSocket();
  const location = useLocation();

  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const [isDark, setIsDark] = useState<boolean>(() => {
    return localStorage.getItem('theme') === 'dark';
  });

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDark]);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  const toggleTheme = () => setIsDark(!isDark);

  // Dynamic Page Title
  const getPageTitle = () => {
    const path = location.pathname;
    if (path === '/') return 'Dashboard';
    if (path.startsWith('/counter')) return 'Counter Screen';
    if (path.startsWith('/students')) return 'Students';
    if (path.startsWith('/plans')) return 'Meal Plans';
    if (path.startsWith('/meals')) return 'Meal Log';
    if (path.startsWith('/reports')) return 'Reports';
    if (path.startsWith('/staff')) return 'Staff & Audit';
    return 'Mess Tokens';
  };

  const navItems = [
    { name: 'Dashboard', path: '/', icon: LayoutDashboard, ownerOnly: true },
    { name: 'Counter', path: '/counter', icon: ScanLine, ownerOnly: false },
    { name: 'Students', path: '/students', icon: Users, ownerOnly: false },
    { name: 'Plans', path: '/plans', icon: CreditCard, ownerOnly: true },
    { name: 'Meal log', path: '/meals', icon: History, ownerOnly: true },
    { name: 'Reports', path: '/reports', icon: FileBarChart, ownerOnly: true },
    { name: 'Staff and audit', path: '/staff', icon: ShieldCheck, ownerOnly: true },
  ];

  const visibleNav = navItems.filter((item) => (isOwner ? true : !item.ownerOnly));

  // Current formatted IST date
  const todayStr = new Intl.DateTimeFormat('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  }).format(new Date());

  const renderNavLinks = (onItemClick?: () => void) => (
    <nav className="p-3 space-y-1">
      {visibleNav.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            onClick={onItemClick}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-medium transition-all ${
                isActive
                  ? 'bg-accent/10 text-accent font-semibold shadow-xs'
                  : 'text-text-muted hover:bg-surface-subtle hover:text-text'
              }`
            }
          >
            <Icon className="w-4 h-4 flex-shrink-0" />
            <span>{item.name}</span>
          </NavLink>
        );
      })}
    </nav>
  );

  const renderSidebarFooter = () => (
    <div className="p-3 border-t border-border space-y-2">
      <div className="flex items-center justify-between px-2">
        <span className="text-[11px] font-medium text-text-muted">Theme</span>
        <button
          onClick={toggleTheme}
          className="p-1.5 rounded-md hover:bg-surface-subtle text-text-muted hover:text-text transition-colors"
          title="Toggle light/dark mode"
        >
          {isDark ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5" />}
        </button>
      </div>

      <div className="flex items-center justify-between p-2 rounded-lg bg-surface-subtle">
        <div className="overflow-hidden">
          <div className="text-xs font-semibold truncate">{user?.name || 'Staff User'}</div>
          <div className="text-[10px] uppercase font-bold text-accent tracking-wider">
            {user?.role || 'COUNTER'}
          </div>
        </div>
        <button
          onClick={() => logout()}
          className="p-1.5 rounded hover:bg-danger-subtle text-text-muted hover:text-danger transition-colors"
          title="Sign out"
        >
          <LogOut className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-surface text-text">
      {/* Desktop Left Sidebar (~208px) */}
      <aside className="hidden md:flex w-52 flex-shrink-0 border-r border-border bg-surface-elevated flex-col justify-between select-none">
        <div>
          {/* Brand */}
          <div className="h-16 flex items-center gap-2.5 px-5 border-b border-border">
            <div className="w-8 h-8 rounded-lg bg-accent text-white flex items-center justify-center font-bold shadow-sm">
              <Fingerprint className="w-5 h-5" />
            </div>
            <div>
              <span className="font-bold text-sm tracking-tight block">Mess tokens</span>
              <span className="text-[11px] text-text-muted block -mt-0.5">Prepaid meal system</span>
            </div>
          </div>

          {/* Navigation Links */}
          {renderNavLinks()}
        </div>

        {/* User Profile & Theme Footer */}
        {renderSidebarFooter()}
      </aside>

      {/* Mobile Drawer (Slide out overlay) */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative w-64 max-w-[80vw] bg-surface-elevated border-r border-border flex flex-col justify-between z-10 shadow-2xl animate-in slide-in-from-left duration-200">
            <div>
              <div className="h-16 flex items-center justify-between px-4 border-b border-border">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-accent text-white flex items-center justify-center font-bold shadow-sm">
                    <Fingerprint className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="font-bold text-sm tracking-tight block">Mess tokens</span>
                    <span className="text-[11px] text-text-muted block -mt-0.5">Prepaid meal system</span>
                  </div>
                </div>
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-surface-subtle"
                  aria-label="Close menu"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {renderNavLinks(() => setMobileMenuOpen(false))}
            </div>

            {renderSidebarFooter()}
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Header Bar */}
        <header className="h-16 flex-shrink-0 border-b border-border bg-surface-elevated/70 backdrop-blur-xs flex items-center justify-between px-3 sm:px-6 z-10">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="p-2 -ml-1 rounded-lg text-text-muted hover:text-text hover:bg-surface-subtle md:hidden transition-colors flex-shrink-0"
              aria-label="Open navigation menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <h1 className="text-sm sm:text-base font-bold text-text tracking-tight truncate">
                {getPageTitle()}
              </h1>
              <span className="text-[10px] sm:text-xs text-text-muted block truncate">
                {todayStr} (IST)
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
            {/* Quick Mobile Theme Button */}
            <button
              onClick={toggleTheme}
              className="md:hidden p-1.5 rounded-md hover:bg-surface-subtle text-text-muted hover:text-text transition-colors"
              title="Toggle theme"
            >
              {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
            </button>

            {/* Device Status Pill */}
            <div
              className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full text-[11px] sm:text-xs font-medium border transition-colors ${
                isDeviceOnline
                  ? 'bg-success-subtle text-success border-success-border'
                  : 'bg-danger-subtle text-danger border-danger-border'
              }`}
            >
              <span
                className={`w-1.5 sm:w-2 h-1.5 sm:h-2 rounded-full ${
                  isDeviceOnline ? 'bg-success animate-pulse' : 'bg-danger'
                }`}
              />
              {isDeviceOnline ? (
                <>
                  <Wifi className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                  <span className="hidden xs:inline sm:inline">Device online</span>
                  <span className="xs:hidden sm:hidden">Online</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                  <span className="hidden xs:inline sm:inline">Device offline</span>
                  <span className="xs:hidden sm:hidden">Offline</span>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Page Views with Scroll */}
        <main className="flex-1 overflow-y-auto p-3 sm:p-6 pb-20 md:pb-6">
          <Outlet />
        </main>

        {/* Mobile Bottom Navigation Bar for quick thumb access */}
        <nav className="md:hidden flex items-center justify-around h-14 border-t border-border bg-surface-elevated/95 backdrop-blur-md px-2 z-20 flex-shrink-0">
          {visibleNav.slice(0, 4).map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === '/'}
                className={({ isActive }) =>
                  `flex flex-col items-center justify-center flex-1 py-1 text-[10px] font-medium transition-colors ${
                    isActive ? 'text-accent font-bold' : 'text-text-muted hover:text-text'
                  }`
                }
              >
                <Icon className="w-4 h-4 mb-0.5" />
                <span className="truncate max-w-[64px]">{item.name}</span>
              </NavLink>
            );
          })}
          {visibleNav.length > 4 && (
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="flex flex-col items-center justify-center flex-1 py-1 text-[10px] font-medium text-text-muted hover:text-text transition-colors"
            >
              <Menu className="w-4 h-4 mb-0.5" />
              <span>More</span>
            </button>
          )}
        </nav>
      </div>
    </div>
  );
};
