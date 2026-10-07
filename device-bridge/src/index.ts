import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import crypto from 'crypto';
import { FingerprintDevice, DeviceStatus } from './types';
import { MockDevice } from './drivers/mock.driver';
import { ZkDevice } from './drivers/zk.driver';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });

import { APP_URLS } from './urls';

const PORT = process.env.BRIDGE_PORT || process.env.PORT || 4001;
const BACKEND_URL = (
  process.env.BACKEND_URL ||
  (process.env.NODE_ENV === 'production'
    ? APP_URLS.backend
    : 'http://localhost:4000')
).replace(/\/+$/, '');

const DEVICE_ID = process.env.DEVICE_ID || 'DEV-COUNTER-01';
const DEVICE_SECRET = process.env.DEVICE_SECRET || 'mock-device-secret-key-2026';
const DEVICE_DRIVER = process.env.DEVICE_DRIVER || 'mock';
const ZK_IP = process.env.ZK_DEVICE_IP || '192.168.1.201';
const ZK_PORT = Number(process.env.ZK_DEVICE_PORT) || 4370;

const app = express();
app.use(cors());
app.use(express.json());

// Initialize Driver
export const device: FingerprintDevice =
  DEVICE_DRIVER === 'zk' ? new ZkDevice(ZK_IP, ZK_PORT) : new MockDevice();

/**
 * Signs an HTTP request payload using HMAC-SHA256 over (timestamp + body).
 */
export function signPayload(secret: string, timestamp: string | number, body: any): string {
  const bodyStr = body === undefined || body === null || body === ''
    ? ''
    : typeof body === 'string'
    ? body
    : JSON.stringify(body);
  return crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}${bodyStr}`)
    .digest('hex');
}

/**
 * Register Scan Event Handler: Forward device scans to Backend API with HMAC signature and unique event_id.
 */
device.onScan(async (event: { deviceUserId: string; deviceId?: string; eventId?: string }) => {
  console.log(`[Bridge] Received scan event from device:`, event);

  const eventId = event.eventId || `EVT_${DEVICE_ID}_${Date.now()}_${Math.floor(Math.random() * 1000000)}`;
  const payload = {
    deviceUserId: event.deviceUserId,
    deviceId: event.deviceId || DEVICE_ID,
    event_id: eventId,
  };

  const timestamp = new Date().toISOString();
  const signature = signPayload(DEVICE_SECRET, timestamp, payload);

  try {
    const response = await fetch(`${BACKEND_URL}/api/scan`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Device-Id': DEVICE_ID,
        'X-Timestamp': timestamp,
        'X-Signature': signature,
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    console.log(`[Bridge] Backend response for scan [eventId=${eventId}]:`, result);
  } catch (err) {
    console.error(`[Bridge] Failed to forward scan to backend:`, err);
  }
});

/**
 * Sends a signed heartbeat ping to the backend API every 30 seconds.
 */
export async function sendHeartbeat(): Promise<boolean> {
  const timestamp = new Date().toISOString();
  const payload = {
    driver: DEVICE_DRIVER,
    status: 'ONLINE',
  };
  const signature = signPayload(DEVICE_SECRET, timestamp, payload);

  try {
    const response = await fetch(`${BACKEND_URL}/api/devices/heartbeat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Device-Id': DEVICE_ID,
        'X-Timestamp': timestamp,
        'X-Signature': signature,
      },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      console.log(`[Bridge] Heartbeat acknowledged by backend at ${timestamp}`);
      return true;
    } else {
      const errText = await response.text();
      console.warn(`[Bridge] Heartbeat rejected with HTTP ${response.status}: ${errText}`);
      return false;
    }
  } catch (err) {
    console.error(`[Bridge] Heartbeat network failure:`, err);
    return false;
  }
}

// Start 30-second recurring heartbeat
const heartbeatInterval = setInterval(sendHeartbeat, 30000);
// Send first heartbeat immediately on boot
sendHeartbeat();

// GET /status
app.get('/status', async (req, res) => {
  const status = await device.getStatus();
  res.json({
    ...status,
    deviceId: DEVICE_ID,
    backendUrl: BACKEND_URL,
  });
});

// POST /simulate-scan (Dev & Testing only)
app.post('/simulate-scan', (req, res) => {
  if (device instanceof MockDevice) {
    const { deviceUserId, deviceId, eventId } = req.body;
    if (!deviceUserId) {
      res.status(400).json({ error: 'deviceUserId is required' });
      return;
    }
    // If eventId provided in simulate-scan, trigger scan
    device.triggerScan(deviceUserId, deviceId || DEVICE_ID);
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

const server = app.listen(PORT, () => {
  console.log(`[Bridge] Device Bridge service running on port ${PORT}`);
  console.log(`[Bridge] Connected to Backend: ${BACKEND_URL}`);
  console.log(`[Bridge] Device ID: ${DEVICE_ID}`);
});

export { server, heartbeatInterval };
