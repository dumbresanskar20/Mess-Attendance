import { Router, Request, Response, NextFunction } from 'express';
import { db } from '../db/connection';
import { authenticateDevice } from '../middlewares/deviceAuth.middleware';
import { emitDeviceStatus } from '../socket';

const router = Router();

// POST /api/devices/heartbeat - Device bridge heartbeat ping (Signed with HMAC)
router.post(
  '/devices/heartbeat',
  authenticateDevice,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const device = req.device!;
      const now = new Date();

      await db('devices')
        .where('id', device.id)
        .update({
          last_heartbeat_at: now,
          updated_at: now,
        });

      const payload = {
        connected: true,
        online: true,
        deviceId: device.device_id,
        driver: req.body?.driver || 'zk',
        lastSeen: now.toISOString(),
        lastHeartbeat: now.toISOString(),
      };

      emitDeviceStatus(payload);

      res.json({
        success: true,
        deviceId: device.device_id,
        timestamp: now.toISOString(),
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/devices/heartbeat & /api/device/status & /api/devices/status
const getDeviceStatusHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const devices = await db('devices').where('is_active', true);
    const now = Date.now();
    let latestHeartbeat: Date | null = null;
    let isOnline = false;

    for (const d of devices) {
      if (d.last_heartbeat_at) {
        const hbTime = new Date(d.last_heartbeat_at).getTime();
        if (!latestHeartbeat || hbTime > new Date(latestHeartbeat).getTime()) {
          latestHeartbeat = d.last_heartbeat_at;
        }
        // Heartbeat considered valid if within 90 seconds
        if (now - hbTime <= 90 * 1000) {
          isOnline = true;
        }
      }
    }

    res.json({
      connected: isOnline,
      online: isOnline,
      lastSeen: latestHeartbeat ? new Date(latestHeartbeat).toISOString() : null,
      lastHeartbeat: latestHeartbeat ? new Date(latestHeartbeat).toISOString() : null,
      driver: 'zk',
      devices: devices.map((d) => {
        const isDeviceOnline = d.last_heartbeat_at
          ? now - new Date(d.last_heartbeat_at).getTime() <= 90 * 1000
          : false;
        return {
          deviceId: d.device_id,
          name: d.name,
          isActive: d.is_active,
          lastHeartbeatAt: d.last_heartbeat_at,
          isOnline: isDeviceOnline,
        };
      }),
    });
  } catch (error) {
    next(error);
  }
};

router.get('/devices/heartbeat', getDeviceStatusHandler);
router.get('/devices/status', getDeviceStatusHandler);
router.get('/device/status', getDeviceStatusHandler);

export default router;
