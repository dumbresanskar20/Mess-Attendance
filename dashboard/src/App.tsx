import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import { AppLayout } from './components/layout/AppLayout';

import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { CounterPage } from './pages/CounterPage';
import { StudentsPage } from './pages/StudentsPage';
import { StudentProfilePage } from './pages/StudentProfilePage';
import { PlansPage } from './pages/PlansPage';
import { MealLogPage } from './pages/MealLogPage';
import { ReportsPage } from './pages/ReportsPage';
import { StaffAuditPage } from './pages/StaffAuditPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const ProtectedRoute: React.FC<{
  children: React.ReactNode;
  ownerOnly?: boolean;
}> = ({ children, ownerOnly = false }) => {
  const { isAuthenticated, isLoading, isOwner, role } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen w-screen flex items-center justify-center bg-surface">
        <div className="w-8 h-8 rounded-full border-2 border-accent border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // If role is COUNTER and user visits root dashboard, route them to /counter
  if (role === 'COUNTER' && ownerOnly) {
    return <Navigate to="/counter" replace />;
  }

  return <>{children}</>;
};

export const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <SocketProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<LoginPage />} />

              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <AppLayout />
                  </ProtectedRoute>
                }
              >
                {/* Dashboard (Owner only; Counter redirected to /counter) */}
                <Route
                  index
                  element={
                    <ProtectedRoute ownerOnly={true}>
                      <DashboardPage />
                    </ProtectedRoute>
                  }
                />

                {/* Counter Screen (Accessible to both Owner and Counter) */}
                <Route path="counter" element={<CounterPage />} />

                {/* Students Directory & Profile (Accessible to both) */}
                <Route path="students" element={<StudentsPage />} />
                <Route path="students/:id" element={<StudentProfilePage />} />

                {/* Owner Only Routes */}
                <Route
                  path="plans"
                  element={
                    <ProtectedRoute ownerOnly={true}>
                      <PlansPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="meals"
                  element={
                    <ProtectedRoute ownerOnly={true}>
                      <MealLogPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="reports"
                  element={
                    <ProtectedRoute ownerOnly={true}>
                      <ReportsPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="staff"
                  element={
                    <ProtectedRoute ownerOnly={true}>
                      <StaffAuditPage />
                    </ProtectedRoute>
                  }
                />
              </Route>

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </SocketProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
};

export default App;
