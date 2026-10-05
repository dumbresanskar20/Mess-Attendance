export interface DeviceStatus {
  connected: boolean;
  driver: 'mock' | 'zk';
  ip?: string;
  port?: number;
  userCount?: number;
  templateCount?: number;
  lastSeen?: string;
  error?: string | null;
}

export interface EnrollResult {
  deviceUserId: string;
  fingerIndex: number;
  rawTemplate: string;
}

export interface FingerprintDevice {
  connect(): Promise<boolean>;
  disconnect(): Promise<void>;
  getStatus(): Promise<DeviceStatus>;
  enrollFinger(
    deviceUserId: string,
    fingerIndex: number,
    onProgress?: (step: number) => void
  ): Promise<EnrollResult>;
  uploadTemplate(
    deviceUserId: string,
    fingerIndex: number,
    template: Buffer | string
  ): Promise<boolean>;
  deleteUser(deviceUserId: string): Promise<boolean>;
  clearAll(): Promise<boolean>;
  onScan(callback: (event: { deviceUserId: string; deviceId?: string }) => void): void;
}
