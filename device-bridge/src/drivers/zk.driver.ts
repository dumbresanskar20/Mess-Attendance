import { FingerprintDevice, DeviceStatus, EnrollResult } from '../types';

let ZKLib: any = null;
try {
  ZKLib = require('node-zklib');
} catch (e) {
  // node-zklib may not be available on all development machines
}

export class ZkDevice implements FingerprintDevice {
  private zkInstance: any = null;
  private ip: string;
  private port: number;
  private isConnected = false;
  private scanListeners: Array<(event: { deviceUserId: string; deviceId?: string }) => void> = [];
  private reconnectTimer: NodeJS.Timeout | null = null;

  constructor(ip = '192.168.1.201', port = 4370) {
    this.ip = ip;
    this.port = port;
  }

  async connect(): Promise<boolean> {
    if (!ZKLib) {
      console.warn('node-zklib library is not installed or supported on this system');
      return false;
    }

    try {
      this.zkInstance = new ZKLib(this.ip, this.port, 10000, 4000);
      await this.zkInstance.createSocket();
      this.isConnected = true;
      console.log(`Connected to ZK device at ${this.ip}:${this.port}`);

      // Start listening to real-time events
      this.zkInstance.getRealTimeLogs((data: any) => {
        if (data && (data.userId || data.deviceUserId)) {
          const devId = String(data.userId || data.deviceUserId);
          for (const listener of this.scanListeners) {
            listener({ deviceUserId: devId, deviceId: `ZK-${this.ip}` });
          }
        }
      });

      return true;
    } catch (err) {
      this.isConnected = false;
      console.error(`Failed to connect to ZK device at ${this.ip}:${this.port}:`, err);
      this.scheduleReconnect();
      return false;
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      console.log('Attempting reconnection to ZK device...');
      await this.connect();
    }, 10000);
  }

  async disconnect(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.zkInstance) {
      try {
        await this.zkInstance.disconnect();
      } catch (e) {}
    }
    this.isConnected = false;
  }

  async getStatus(): Promise<DeviceStatus> {
    let userCount = 0;
    try {
      if (this.isConnected && this.zkInstance) {
        const users = await this.zkInstance.getUsers();
        userCount = users?.data?.length || 0;
      }
    } catch (e) {}

    return {
      connected: this.isConnected,
      driver: 'zk',
      ip: this.ip,
      port: this.port,
      userCount,
      lastSeen: new Date().toISOString(),
      error: this.isConnected ? null : 'Disconnected or unreachable',
    };
  }

  async enrollFinger(
    deviceUserId: string,
    fingerIndex: number,
    onProgress?: (step: number) => void
  ): Promise<EnrollResult> {
    if (!this.isConnected || !this.zkInstance) {
      throw new Error('ZK Device is offline. Cannot enroll fingerprint.');
    }

    // Call ZK device native enrollment command
    // Many ZKTeco devices use enrollUser or setUserFace/Fingerprint
    const enrollRes = await this.zkInstance.enrollUser(Number(deviceUserId), fingerIndex);

    return {
      deviceUserId,
      fingerIndex,
      rawTemplate: JSON.stringify(enrollRes || { enrolled: true }),
    };
  }

  async uploadTemplate(
    deviceUserId: string,
    fingerIndex: number,
    template: Buffer | string
  ): Promise<boolean> {
    if (!this.isConnected || !this.zkInstance) {
      return false;
    }
    try {
      const tmplBuf = Buffer.isBuffer(template) ? template : Buffer.from(template, 'base64');
      await this.zkInstance.setUser(Number(deviceUserId), 'User', '', 0, 0);
      return true;
    } catch (e) {
      return false;
    }
  }

  async deleteUser(deviceUserId: string): Promise<boolean> {
    if (!this.isConnected || !this.zkInstance) return false;
    try {
      await this.zkInstance.deleteUser(Number(deviceUserId));
      return true;
    } catch (e) {
      return false;
    }
  }

  async clearAll(): Promise<boolean> {
    if (!this.isConnected || !this.zkInstance) return false;
    try {
      await this.zkInstance.clearData();
      return true;
    } catch (e) {
      return false;
    }
  }

  onScan(callback: (event: { deviceUserId: string; deviceId?: string }) => void): void {
    this.scanListeners.push(callback);
  }
}
