import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { FingerprintDevice, DeviceStatus } from './types';
import { MockDevice } from './drivers/mock.driver';
import { ZkDevice } from './drivers/zk.driver';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });

import { APP_URLS } from './urls';

const PORT = process.env.BRIDGE_PORT || 4001;
const BACKEND_URL = (
  process.env.BACKEND_URL ||
  (process.env.NODE_ENV === 'production'
    ? APP_URLS.backend
    : 'http://localhost:4000')
).replace(/\/+$/, '');
const DEVICE_DRIVER = process.env.DEVICE_DRIVER || 'mock';
const ZK_IP = process.env.ZK_DEVICE_IP || '192.168.1.201';
const ZK_PORT = Number(process.env.ZK_DEVICE_PORT) || 4370;

const app = express();
app.use(cors());
app.use(express.json());

// Initialize Driver
export const device: FingerprintDevice =
  DEVICE_DRIVER === 'zk' ? new ZkDevice(ZK_IP, ZK_PORT) : new MockDevice();

// Register Scan Event Handler: Forward device scans to Backend API
device.onScan(async (event: { deviceUserId: string; deviceId?: string }) => {
  console.log(`[Bridge] Received scan event from device:`, event);

  try {
    const response = await fetch(`${BACKEND_URL}/api/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceUserId: event.deviceUserId,
        deviceId: event.deviceId,
      }),
    });

    const result = await response.json();
    console.log(`[Bridge] Backend response for scan:`, result);
  } catch (err) {
    console.error(`[Bridge] Failed to forward scan to backend:`, err);
  }
});

// GET /status
app.get('/status', async (req, res) => {
  const status = await device.getStatus();
  res.json(status);
});

// POST /simulate-scan (Dev & Testing only)
app.post('/simulate-scan', (req, res) => {
  if (device instanceof MockDevice) {
    const { deviceUserId, deviceId } = req.body;
    if (!deviceUserId) {
      res.status(400).json({ error: 'deviceUserId is required' });
      return;
    }
    device.triggerScan(deviceUserId, deviceId);
    res.json({ success: true, message: `Simulated scan for deviceUserId ${deviceUserId}` });
  } else {
    res.status(400).json({ error: 'Simulated scans are only supported with the Mock driver' });
  }
});

// POST /enroll
app.post('/enroll', async (req, res) => {
  try {
    const { deviceUserId, fingerIndex } = req.body;
    if (!deviceUserId) {
      res.status(400).json({ error: 'deviceUserId is required' });
      return;
    }
    const enrollRes = await device.enrollFinger(
      String(deviceUserId),
      fingerIndex || 1,
      (step: number) => console.log(`[Bridge] Enrollment step: ${step}/3`)
    );
    res.json(enrollRes);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Enrollment failed' });
  }
});

// POST /sync
app.post('/sync', async (req, res) => {
  try {
    const { templates } = req.body; // Array of { deviceUserId, fingerIndex, template }
    if (!Array.isArray(templates)) {
      res.status(400).json({ error: 'templates array is required' });
      return;
    }
    let successCount = 0;
    for (const t of templates) {
      const ok = await device.uploadTemplate(t.deviceUserId, t.fingerIndex || 1, t.template);
      if (ok) successCount++;
    }
    res.json({
      success: true,
      syncedCount: successCount,
      totalCount: templates.length,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Sync failed' });
  }
});

device.connect().then((connected: boolean) => {
  console.log(`[Bridge] Driver "${DEVICE_DRIVER}" initialization: ${connected ? 'ONLINE' : 'OFFLINE'}`);
});

app.listen(PORT, () => {
  console.log(`[Bridge] Device Bridge service running on port ${PORT}`);
  console.log(`[Bridge] Connected to Backend: ${BACKEND_URL}`);
});
