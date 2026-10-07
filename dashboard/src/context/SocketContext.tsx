import React, { createContext, useContext, useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { ScanOutcome, DeviceStatus } from '../types';
import { apiRequest } from '../api/client';
import { useAuth } from './AuthContext';
import { APP_URLS } from '../config/urls';

interface SocketContextType {
  socket: Socket | null;
  latestScan: ScanOutcome | null;
  deviceStatus: DeviceStatus | null;
  isDeviceOnline: boolean;
  clearLatestScan: () => void;
  refreshDeviceStatus: () => Promise<void>;
}

const SocketContext = createContext<SocketContextType | undefined>(undefined);

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [latestScan, setLatestScan] = useState<ScanOutcome | null>(null);
  const [deviceStatus, setDeviceStatus] = useState<DeviceStatus | null>({
    connected: true, // Default to online for smooth UX
    driver: 'mock',
    lastSeen: new Date().toISOString(),
  });

  const fetchDeviceStatus = async () => {
    try {
      const data = await apiRequest<DeviceStatus>('/device/status');
      setDeviceStatus(data);
    } catch {
      // If endpoint fails, keep current state or fallback
    }
  };

  useEffect(() => {
    if (!isAuthenticated) {
      if (socket) {
        socket.disconnect();
        setSocket(null);
      }
      return;
    }

    fetchDeviceStatus();

    // Poll device status every 30 seconds
    const interval = setInterval(fetchDeviceStatus, 30000);

    const socketUrl =
      import.meta.env.VITE_BACKEND_URL ||
      (typeof window !== 'undefined' &&
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
        ? 'http://localhost:4000'
        : APP_URLS.backend);

    const s = io(socketUrl, {
      transports: ['websocket', 'polling'],
      withCredentials: true,
      reconnectionAttempts: 10,
    });

    s.on('connect', () => {
      console.log('[Socket] Connected to backend');
    });

    s.on('scan:result', (data: ScanOutcome) => {
      console.log('[Socket] Received scan:result', data);
      setLatestScan(data);
    });

    s.on('device:status', (status: DeviceStatus) => {
      console.log('[Socket] Received device:status', status);
      setDeviceStatus(status);
    });

    setSocket(s);

    return () => {
      clearInterval(interval);
      s.disconnect();
    };
  }, [isAuthenticated]);

  const [now, setNow] = useState(Date.now());

  // Periodically update local timestamp to evaluate 90s heartbeat expiry
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(timer);
  }, []);

  const isDeviceOnline = (() => {
    if (!deviceStatus) return false;
    if (!deviceStatus.connected) return false;
    if (deviceStatus.lastSeen) {
      const lastSeenTime = new Date(deviceStatus.lastSeen).getTime();
      if (!isNaN(lastSeenTime) && now - lastSeenTime > 90000) {
        return false;
      }
    }
    return true;
  })();

  const clearLatestScan = () => {
    setLatestScan(null);
  };

  return (
    <SocketContext.Provider
      value={{
        socket,
        latestScan,
        deviceStatus,
        isDeviceOnline,
        clearLatestScan,
        refreshDeviceStatus: fetchDeviceStatus,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
};
