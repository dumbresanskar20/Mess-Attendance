# Setup & Deployment Guide: Mess Tokens System

## 1. System Overview

Mess Tokens is an on-premises, biometric-first prepaid meal-token management system designed to operate locally on a counter PC at a mess/canteen with direct LAN connectivity to a biometric fingerprint reader.

---

## 2. Prerequisites

- **Node.js**: v18.0.0 or higher (v20+ recommended)
- **MySQL Server**: 8.0+ InnoDB (native Windows service or Docker container)
- **Package Manager**: npm or yarn
- **Hardware (Optional for production)**: ZKTeco / eSSL standalone fingerprint terminal connected to the same LAN subnet (e.g., `192.168.1.201:4370`). In development, the system runs with an embedded `MockDevice` simulator requiring zero hardware.

---

## 3. Database Setup

### Option A: Using Docker Compose (Recommended for isolated environments)

```bash
docker compose up -d
```

This starts a containerized MySQL 8.0 instance on port `3306` with the `mess_tokens` database initialized and healthy.

### Option B: Using Native MySQL Server

Ensure MySQL 8.0 is running on `127.0.0.1:3306`, then create the database and user:

```sql
CREATE DATABASE IF NOT EXISTS mess_tokens CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'mess_user'@'localhost' IDENTIFIED BY 'mess_secure_password_2026';
CREATE USER IF NOT EXISTS 'mess_user'@'127.0.0.1' IDENTIFIED BY 'mess_secure_password_2026';
CREATE USER IF NOT EXISTS 'mess_user'@'%' IDENTIFIED BY 'mess_secure_password_2026';
GRANT ALL PRIVILEGES ON mess_tokens.* TO 'mess_user'@'localhost';
GRANT ALL PRIVILEGES ON mess_tokens.* TO 'mess_user'@'127.0.0.1';
GRANT ALL PRIVILEGES ON mess_tokens.* TO 'mess_user'@'%';
GRANT TRIGGER, SUPER ON *.* TO 'mess_user'@'localhost';
GRANT TRIGGER, SUPER ON *.* TO 'mess_user'@'127.0.0.1';
GRANT TRIGGER, SUPER ON *.* TO 'mess_user'@'%';
SET GLOBAL log_bin_trust_function_creators = 1;
FLUSH PRIVILEGES;
```

---

## 4. Environment Configuration

Copy `.env.example` to `.env` in the project root:

```ini
PORT=4000
NODE_ENV=development
APP_TIMEZONE=Asia/Kolkata

DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=mess_user
DB_PASSWORD=mess_secure_password_2026
DB_NAME=mess_tokens

JWT_ACCESS_SECRET=super_secret_mess_access_jwt_key_32_chars_long!
JWT_REFRESH_SECRET=super_secret_mess_refresh_jwt_key_32_chars_long!
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# 64 hex characters (32 bytes) for AES-256-GCM biometric encryption
FINGERPRINT_ENCRYPTION_KEY=e4d2938a16c74bc992a514d8f072c49a1b8e6f3d5c7a9b0e2d4f6a8c0e2b4d6f

CORS_ORIGIN=http://localhost:5173
DEVICE_BRIDGE_URL=http://localhost:4001
POLICY_EXPIRE_UNUSED_TOKENS=false

BACKUP_DIR=./backups
BACKUP_RETENTION_DAYS=30
```

---

## 5. Migrations & Initial Seed

Run database migrations and seed realistic test data:

```bash
# Run schema migration (tables, append-only triggers, unique keys, views)
npm run migrate

# Seed accounts, plans, meal windows, and 30 sample students with 7 days of attendance
npm run seed
```

### Default Credentials Seeded:
- **Owner Account**: `owner@mess.local` / `Owner@123456` (Full Administrative Access)
- **Counter Account**: `counter@mess.local` / `Counter@123456` (Counter Screen & Student Lookup Only)

---

## 6. Running the Application

### Development Mode

Run all services simultaneously:

```bash
# Terminal 1: Backend API (Port 4000)
npm run dev:backend

# Terminal 2: Device Bridge Service (Port 4001)
npm run dev:bridge

# Terminal 3: Vite Admin Dashboard (Port 5173)
npm run dev:dashboard
```

Or run all with concurrently:
```bash
npm run dev
```

Visit the dashboard in your browser: `http://localhost:5173`

---

## 7. Running Automated Tests

Run the full automated Vitest test suite covering crypto, database append-only triggers, role-based access control, scan engine invariants, and device bridge flows:

```bash
npm test
```
