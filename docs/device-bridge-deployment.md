# Device Bridge Deployment & Security Guide

This document details the configuration, security architecture, and deployment procedures for running `@mess-tokens/device-bridge` on a local PC or Raspberry Pi inside the mess local area network (LAN).

---

## 1. Network Topology & Architecture

Physical biometric devices (such as ZKTeco K40, IN01, or uFace series) communicate using a proprietary binary protocol over **TCP port 4370**. Because cloud servers cannot directly initiate incoming TCP connections to devices behind NAT/firewalls in the mess facility, the **Device Bridge** runs locally inside the canteen LAN.

```
+-------------------------------------------------------------------------+
|                              MESS LAN                                   |
|                                                                         |
|   +-----------------------+                 +-----------------------+   |
|   | ZKTeco Scanner Device |  TCP port 4370  |  Raspberry Pi / PC    |   |
|   |   (192.168.1.201)     | <=============> |     Device Bridge     |   |
|   +-----------------------+                 |     (Port 4001)       |   |
+---------------------------------------------+-----------||--------------+
                                                          ||
                                              HTTPS (HMAC-SHA256 Signed)
                                              + Headers: X-Device-Id,
                                              |          X-Timestamp,
                                              |          X-Signature
                                                          ||
                                                          \/
                                              +-----------------------+
                                              |  Cloud / Main Backend |
                                              |    POST /api/scan     |
                                              |    POST /heartbeat    |
                                              +-----------------------+
```

---

## 2. Security & HMAC-SHA256 Signature Specification

To prevent spoofed meal scans and replay attacks, all requests originating from the bridge to the backend require cryptographic HMAC-SHA256 authentication:

### 2.1 Credentials & Storage
- Each device bridge is assigned a unique `DEVICE_ID` (e.g. `DEV-COUNTER-01`) and a pre-shared `DEVICE_SECRET` (e.g. `mock-device-secret-key-2026`).
- The backend stores active device credentials in the `devices` table with columns: `device_id`, `name`, `secret_hash`, `is_active`, and `last_heartbeat_at`.

### 2.2 Request Signing Protocol
Every HTTP request from the bridge to `/api/scan` and `/api/devices/heartbeat` includes the following headers:
- `X-Device-Id`: Device identifier string (e.g. `DEV-COUNTER-01`).
- `X-Timestamp`: Current ISO-8601 or epoch timestamp (e.g. `2026-10-07T00:55:00.000Z`).
- `X-Signature`: Hex-encoded HMAC-SHA256 digest computed over `(timestamp + body)`:
  $$\text{Signature} = \text{HMAC-SHA256}(\text{DEVICE\_SECRET}, \text{timestamp} \parallel \text{JSON.stringify}(\text{body}))$$

### 2.3 Replay Protection & Idempotency
1. **Replay Window**: The backend enforces a strict **60-second window**. Requests with `|now - timestamp| > 60s` are immediately rejected with HTTP `401 Unauthorized`.
2. **Idempotency on `event_id`**: Each scan event is assigned a unique `event_id` (device log ID / UUID). If network retries resend the same `event_id`, the backend recognizes the duplicate, does not deduct extra tokens, and returns the existing meal record.
3. **Role & Route Separation**:
   - `POST /api/scan` strictly requires a device signature and rejects staff JWTs.
   - Staff endpoints (e.g. `/api/students`, `/api/meals/manual`) strictly require staff JWTs and reject device signatures.

---

## 3. Device Heartbeat & Offline Monitoring

- **Bridge Heartbeat**: The bridge sends a signed `POST /api/devices/heartbeat` ping every **30 seconds**.
- **Backend Timestamp Tracking**: The backend updates `devices.last_heartbeat_at = NOW(3)` and broadcasts status updates via Socket.IO.
- **Offline Banner**: If no heartbeat is received from an active device for **90 seconds**, the backend and dashboard mark the device as `OFFLINE`, displaying the **"Device offline"** alert banner on `CounterPage` to prompt counter staff to use manual meal marking fallback.

---

## 4. Deployment on Raspberry Pi / Local PC

### Option A: Docker Deployment (Recommended)

1. Clone repository and navigate to `device-bridge`:
   ```bash
   cd Mess-Attendance/device-bridge
   ```

2. Create a `.env` configuration file:
   ```env
   NODE_ENV=production
   BRIDGE_PORT=4001
   PORT=4001
   BACKEND_URL=https://your-backend-api.com
   DEVICE_ID=DEV-COUNTER-01
   DEVICE_SECRET=your_secure_device_secret_here
   DEVICE_DRIVER=zk
   ZK_DEVICE_IP=192.168.1.201
   ZK_DEVICE_PORT=4370
   ```

3. Build and run the Docker container:
   ```bash
   # Build multi-arch image (works on Raspberry Pi 3/4/5 ARM64 and x86_64 PC)
   docker build -t mess-device-bridge:latest .

   # Run container with auto-restart on system reboot
   docker run -d \
     --name mess_device_bridge \
     --restart always \
     --network host \
     --env-file .env \
     mess-device-bridge:latest
   ```

4. Verify container logs:
   ```bash
   docker logs -f mess_device_bridge
   ```

---

### Option B: Native Node.js + systemd Service (Raspberry Pi OS / Ubuntu)

1. Install Node.js 20+:
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt-get install -y nodejs build-essential
   ```

2. Install dependencies and compile TypeScript:
   ```bash
   cd /opt/Mess-Attendance/device-bridge
   npm ci
   npm run build
   ```

3. Create systemd service unit `/etc/systemd/system/mess-bridge.service`:
   ```ini
   [Unit]
   Description=Mess Attendance Fingerprint Device Bridge
   After=network.target

   [Service]
   Type=simple
   User=pi
   WorkingDirectory=/opt/Mess-Attendance/device-bridge
   EnvironmentFile=/opt/Mess-Attendance/device-bridge/.env
   ExecStart=/usr/bin/node dist/index.js
   Restart=always
   RestartSec=5

   [Install]
   WantedBy=multi-user.target
   ```

4. Enable and start the service:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable mess-bridge
   sudo systemctl start mess-bridge
   sudo systemctl status mess-bridge
   ```

---

## 5. Troubleshooting & Connectivity

### Test TCP 4370 Reachability
From the Raspberry Pi / PC terminal, verify the ZKTeco scanner is responding on TCP port 4370:
```bash
# Test ping
ping 192.168.1.201

# Test TCP 4370 connection
nc -zv 192.168.1.201 4370
# OR
telnet 192.168.1.201 4370
```

### Check Bridge Local Health Check
```bash
curl http://localhost:4001/status
```
Expected response:
```json
{
  "connected": true,
  "driver": "zk",
  "ip": "192.168.1.201",
  "port": 4370,
  "userCount": 42,
  "deviceId": "DEV-COUNTER-01",
  "backendUrl": "https://your-backend-api.com"
}
```
