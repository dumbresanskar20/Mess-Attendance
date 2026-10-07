import { Request, Response, NextFunction } from 'express';
import { db } from '../db/connection';
import { UnauthorizedError } from './error.middleware';
import {
  calculateDeviceSignature,
  timingSafeCompare,
  isTimestampValid,
} from '../utils/deviceSignature';
import { Device } from '../types';

declare global {
  namespace Express {
    interface Request {
      device?: Device;
    }
  }
}

/**
 * Middleware to authenticate hardware device bridges using HMAC-SHA256 signatures.
 * Requires X-Device-Id, X-Timestamp, and X-Signature headers.
 * Protects against replay attacks with a 60-second timestamp freshness window.
 * Strictly rejects staff JWT tokens to keep staff and device auth boundaries distinct.
 */
export async function authenticateDevice(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const deviceId = (req.headers['x-device-id'] || req.headers['X-Device-Id']) as string | undefined;
  const timestamp = (req.headers['x-timestamp'] || req.headers['X-Timestamp']) as string | undefined;
  const signature = (req.headers['x-signature'] || req.headers['X-Signature']) as string | undefined;
  const authHeader = req.headers.authorization;

  // Explicitly reject staff JWT attempts on device-only routes
  if ((!deviceId || !signature) && authHeader && authHeader.startsWith('Bearer ')) {
    next(
      new UnauthorizedError(
        'Device credentials required. Staff JWT is not permitted on this device endpoint.'
      )
    );
    return;
  }

  if (!deviceId || !timestamp || !signature) {
    next(
      new UnauthorizedError(
        'Missing required device authentication headers: X-Device-Id, X-Timestamp, X-Signature'
      )
    );
    return;
  }

  // 1. Replay protection: Check timestamp freshness (< 60s)
  const { valid: timestampValid } = isTimestampValid(timestamp, 60);
  if (!timestampValid) {
    next(
      new UnauthorizedError(
        'Request timestamp is expired or outside the 60-second validity window (replay protection)'
      )
    );
    return;
  }

  try {
    // 2. Fetch device from database
    const device: Device | undefined = await db('devices')
      .where({ device_id: deviceId, is_active: true })
      .first();

    if (!device) {
      next(new UnauthorizedError(`Device '${deviceId}' is unknown or inactive`));
      return;
    }

    // 3. Verify HMAC-SHA256 signature
    const expectedSignature = calculateDeviceSignature(device.secret_hash, timestamp, req.body);

    if (!timingSafeCompare(signature, expectedSignature)) {
      next(new UnauthorizedError('Invalid device signature'));
      return;
    }

    // Attach device context to request
    req.device = device;
    next();
  } catch (error) {
    next(error);
  }
}
