import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { env } from './config/env';
import { isOriginAllowed } from './config/cors';
import { logger } from './utils/logger';

let ioInstance: SocketIOServer | null = null;

export function initSocket(server: http.Server): SocketIOServer {
  ioInstance = new SocketIOServer(server, {
    cors: {
      origin: (origin, callback) => {
        if (isOriginAllowed(origin)) {
          callback(null, true);
        } else {
          callback(new Error(`Origin ${origin} not allowed by CORS`));
        }
      },
      credentials: true,
    },
  });

  ioInstance.on('connection', (socket) => {
    logger.info({ socketId: socket.id }, 'Client connected to Socket.IO');

    socket.on('disconnect', () => {
      logger.info({ socketId: socket.id }, 'Client disconnected from Socket.IO');
    });
  });

  return ioInstance;
}

export function getSocket(): SocketIOServer | null {
  return ioInstance;
}

export function emitScanResult(data: any): void {
  if (ioInstance) {
    ioInstance.emit('scan:result', data);
  }
}

export function emitDeviceStatus(status: { online: boolean; deviceId?: string; lastSeen?: string }): void {
  if (ioInstance) {
    ioInstance.emit('device:status', status);
  }
}
