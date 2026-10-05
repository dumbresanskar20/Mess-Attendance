import React, { createContext, useContext, useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { ScanOutcome, DeviceStatus } from '../types';
import { apiRequest } from '../api/client';

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
    } catch (e) {
      // If endpoint fails, keep current state or fallback
    }
  };

  useEffect(() => {
    fetchDeviceStatus();

    // Poll device status every 30 seconds
    const interval = setInterval(fetchDeviceStatus, 30000);

    const s = io(window.location.origin, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
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
  }, []);

  const clearLatestScan = () => {
    setLatestScan(null);
  };

  return (
    <SocketContext.Provider
      value={{
        socket,
        latestScan,
        deviceStatus,
        isDeviceOnline: deviceStatus?.connected ?? false,
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
