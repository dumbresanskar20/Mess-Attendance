import { FingerprintDevice, DeviceStatus, EnrollResult } from '../types';

export class MockDevice implements FingerprintDevice {
  private isConnected = true;
  private scanListeners: Array<(event: { deviceUserId: string; deviceId?: string }) => void> = [];
  private storedTemplates: Map<string, string> = new Map();

  async connect(): Promise<boolean> {
    this.isConnected = true;
    return true;
  }

  async disconnect(): Promise<void> {
    this.isConnected = false;
  }

  async getStatus(): Promise<DeviceStatus> {
    return {
      connected: this.isConnected,
      driver: 'mock',
      ip: '127.0.0.1 (virtual)',
      port: 4370,
      userCount: this.storedTemplates.size,
      templateCount: this.storedTemplates.size,
      lastSeen: new Date().toISOString(),
      error: null,
    };
  }

  async enrollFinger(
    deviceUserId: string,
    fingerIndex: number,
    onProgress?: (step: number) => void
  ): Promise<EnrollResult> {
    if (!this.isConnected) {
      throw new Error('Mock device is disconnected');
    }

    // Simulate 3 enrollment presses
    if (onProgress) onProgress(1);
    await new Promise((r) => setTimeout(r, 100));
    if (onProgress) onProgress(2);
    await new Promise((r) => setTimeout(r, 100));
    if (onProgress) onProgress(3);
    await new Promise((r) => setTimeout(r, 100));

    const mockRawTemplate = `MOCK_TMPL_DEV_${deviceUserId}_FINGER_${fingerIndex}_${Date.now()}`;
    const key = `${deviceUserId}_${fingerIndex}`;
    this.storedTemplates.set(key, mockRawTemplate);

    return {
      deviceUserId,
      fingerIndex,
      rawTemplate: mockRawTemplate,
    };
  }

  async uploadTemplate(
    deviceUserId: string,
    fingerIndex: number,
    template: Buffer | string
  ): Promise<boolean> {
    const key = `${deviceUserId}_${fingerIndex}`;
    const tmplStr = Buffer.isBuffer(template) ? template.toString('base64') : template;
    this.storedTemplates.set(key, tmplStr);
    return true;
  }

  async deleteUser(deviceUserId: string): Promise<boolean> {
    for (const key of this.storedTemplates.keys()) {
      if (key.startsWith(`${deviceUserId}_`)) {
        this.storedTemplates.delete(key);
      }
    }
    return true;
  }

  async clearAll(): Promise<boolean> {
    this.storedTemplates.clear();
    return true;
  }

  onScan(callback: (event: { deviceUserId: string; deviceId?: string }) => void): void {
    this.scanListeners.push(callback);
  }

  /**
   * Helper method to simulate a scan event from the UI or tests.
   */
  triggerScan(deviceUserId: string, deviceId = 'MOCK-DEV-01'): void {
    if (!this.isConnected) {
      console.warn('Cannot trigger scan: Mock device is disconnected');
      return;
    }
    for (const listener of this.scanListeners) {
      listener({ deviceUserId, deviceId });
    }
  }
}
