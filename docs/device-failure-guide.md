# Device Failure & Troubleshooting Guide

## 1. Overview

The mess token counter is designed to never block meal service. If the physical biometric scanner fails or loses connection, staff can continue marking meals with full security and zero downtime.

---

## 2. Immediate Action During Meal Service

If the terminal shows **"Device offline"**:
1. Do not halt meal distribution.
2. Instruct staff to use the **Manual Fallback Panel** on `/counter`.
3. Search for each student, select a reason (`Device down / hardware offline`), and mark the meal.
4. All business rules (active plan, positive balance, double-meal prevention) continue to be strictly enforced.

---

## 3. Troubleshooting Biometric Terminal Connectivity

### Step 1: Check Physical Cables & Power
- Verify the blue Ethernet cable is firmly plugged into both the ZKTeco terminal and the router/switch.
- Verify the power adapter is plugged in and the terminal display is on.

### Step 2: Test Network Connectivity (Ping)
Open PowerShell or Command Prompt on the counter PC:

```powershell
ping 192.168.1.201
```

- If you receive `Request timed out`:
  - Check if the counter PC and the terminal are on the same subnet (e.g. `192.168.1.xxx`).
  - Reboot the local network switch or router.

### Step 3: Restart the Bridge Service
If the terminal responds to ping but the dashboard shows offline:

```powershell
npm run dev:bridge
```

---

## 4. Replacing a Hardware Terminal & Biometric Template Sync

If a fingerprint terminal is replaced with a new unit:

1. Connect the new terminal to the LAN and configure its IP address (e.g. `192.168.1.201`, port `4370`).
2. Log in to the Mess Tokens Dashboard as **OWNER**.
3. Navigate to **Fingerprints** or trigger a **Device Sync**:
   - Send `POST /api/device/sync` or use the Admin panel.
4. **How Sync Works**:
   - The database is the single source of truth.
   - All active templates stored in the database are decrypted from AES-256-GCM and uploaded directly to the new terminal.
   - Students **do not need to re-enroll** their fingers!
