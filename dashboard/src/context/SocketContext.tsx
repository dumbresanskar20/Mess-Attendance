import React, { createContext, useContext, useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { ScanOutcome, DeviceStatus } from '../types';
import { apiRequest } from '../api/client';
import { useAuth } from './AuthContext';
import { APP_URLS } from '../config/urls';
import { checkBiometricAvailability, BiometricAvailability } from '../utils/biometrics';

export interface SocketContextType {
  socket: Socket | null;
  latestScan: ScanOutcome | null;
  deviceStatus: DeviceStatus | null;
  // Dual device check
  isDeviceOnline: boolean; // True if EITHER or BOTH scanners are ready
  isExternalOnline: boolean;
  isInternalOnline: boolean;
  scannerStatus: 'BOTH' | 'EXTERNAL' | 'INTERNAL' | 'NONE';
  scannerName: string;
  externalDeviceName: string;
  internalDeviceName: string;
  biometricAvailability: BiometricAvailability | null;
  clearLatestScan: () => void;
  refreshDeviceStatus: () => Promise<void>;
}

const SocketContext = createContext<SocketContextType | undefined>(undefined);

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [latestScan, setLatestScan] = useState<ScanOutcome | null>(null);
  const [deviceStatus, setDeviceStatus] = useState<DeviceStatus | null>({
    connected: false,
    driver: 'zk',
    lastSeen: undefined,
  });
  const [biometricAvailability, setBiometricAvailability] = useState<BiometricAvailability | null>(null);

  // Checks both external bridge status and laptop platform biometrics
  const checkHardwareStatus = async () => {
    try {
      const bio = await checkBiometricAvailability();
      setBiometricAvailability(bio);
    } catch {
      // Ignore background detection errors
    }
  };

  const fetchDeviceStatus = async () => {
    try {
      const data = await apiRequest<DeviceStatus>('/device/status');
      setDeviceStatus(data);
    } catch {
      // If endpoint fails, keep current state or fallback
    }
    await checkHardwareStatus();
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

    // Poll dual device status every 25 seconds
    const interval = setInterval(fetchDeviceStatus, 25000);

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
      fetchDeviceStatus();
    });

    s.on('scan:result', (data: ScanOutcome) => {
      console.log('[Socket] Received scan:result', data);
      setLatestScan(data);
    });

    s.on('device:status', (status: DeviceStatus) => {
      console.log('[Socket] Received device:status', status);
      setDeviceStatus(status);
      checkHardwareStatus();
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

  // 1. External scanner is online if heartbeat is active within 90s OR biometrics utility detected bridge
  const isExternalOnline = (() => {
    if (biometricAvailability?.externalAvailable) return true;
    if (!deviceStatus) return false;
    if (!deviceStatus.connected && !deviceStatus.online) return false;
    if (deviceStatus.lastSeen) {
      const lastSeenTime = new Date(deviceStatus.lastSeen).getTime();
      if (!isNaN(lastSeenTime) && now - lastSeenTime > 90000) {
        return false;
      }
    }
    return true;
  })();

  // 2. Internal scanner is online if Windows Hello / Touch ID is available
  const isInternalOnline = Boolean(biometricAvailability?.inbuiltAvailable);

  // 3. Overall device readiness: Online if EITHER or BOTH are ready!
  const isDeviceOnline = isExternalOnline || isInternalOnline;

  // 4. Detailed status breakdown
  const scannerStatus: 'BOTH' | 'EXTERNAL' | 'INTERNAL' | 'NONE' =
    isExternalOnline && isInternalOnline
      ? 'BOTH'
      : isExternalOnline
      ? 'EXTERNAL'
      : isInternalOnline
      ? 'INTERNAL'
      : 'NONE';

  const externalDeviceName =
    biometricAvailability?.externalDeviceName ||
    (deviceStatus?.driver === 'zk' ? 'ZKTeco/eSSL' : deviceStatus?.deviceId || 'External Machine');

  const internalDeviceName =
    biometricAvailability?.inbuiltDeviceName || 'Laptop Fingerprint Sensor';

  const scannerName = (() => {
    if (scannerStatus === 'BOTH') {
      return `${externalDeviceName} + ${internalDeviceName}`;
    }
    if (scannerStatus === 'EXTERNAL') return externalDeviceName;
    if (scannerStatus === 'INTERNAL') return internalDeviceName;
    return 'Offline';
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
        isExternalOnline,
        isInternalOnline,
        scannerStatus,
        scannerName,
        externalDeviceName,
        internalDeviceName,
        biometricAvailability,
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

