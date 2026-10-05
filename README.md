# Mess Tokens — Prepaid Meal-Token System for Mess Canteen

A biometric-first, prepaid meal-token management system engineered for mess and canteen operations. Students buy a plan (e.g. 60 tokens for 30 days, 2 meals a day). When a student eats, they place a finger on the fingerprint scanner and 1 token is deducted automatically. 

The software is exclusively admin-facing with two strict roles: `OWNER` (full administration) and `COUNTER` (counter screen and student lookup only). **No student login, no student app, and no QR/RFID.**

---

## Key Highlights

- **Biometric Identity**: Enrolls up to 5 fingerprints per student with finger labels (e.g. "Right index"). Biometric templates are stored in MySQL encrypted with **AES-256-GCM** (authenticated ciphertext, IV, and auth tag). The database is the source of truth.
- **Append-Only Database Security**: `token_ledger`, `meal_log`, and `audit_log` are strictly append-only. MySQL triggers raise errors on any `UPDATE` or `DELETE` attempt.
- **Race Condition & Double-Deduction Prevention**: Enforced at the database level with a generated column and `UNIQUE` index on `(student_id, meal_window_id, meal_date)` for `result = 'APPROVED'`. Two simultaneous scans can never double-deduct.
- **Manual Fallback**: If a fingerprint fails to read, counter staff can mark meals manually with a mandatory reason. It passes the exact same business rules and is logged with staff name and timestamp.
- **Hardware Abstraction**: `FingerprintDevice` interface with two drivers:
  - `MockDevice`: Allows full end-to-end development, simulation, and testing with zero physical hardware.
  - `ZkDevice`: Real driver using `node-zklib` for ZKTeco / eSSL standalone terminals over LAN.
- **Admin Dashboard**: Real-time counter screen with instant audio-visual feedback, Socket.IO live stream, Recharts weekly attendance visualization, low balance & expiry alerts, and monthly Excel/PDF reporting.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Admin Dashboard | React 18, Vite, TypeScript, Tailwind CSS, TanStack Query, Recharts, Lucide React |
| Backend API | Node.js, Express, TypeScript, Zod, Socket.IO, Pino, Helmet, CORS |
| Database | MySQL 8.0 InnoDB with Knex migrations & triggers |
| Security | AES-256-GCM (Biometrics), Bcrypt, JWT (Access & Refresh tokens) |
| Device Bridge | Node.js service, `node-zklib`, `MockDevice` |
| Jobs & Reports | `node-cron` (plan expiry & nightly backups), `exceljs`, `pdfkit` |
| Testing | Vitest, Supertest (42 automated unit & integration tests) |

---

## Repository Structure

```
Mess Attendance/
├── backend/            # Express REST API, Knex migrations, triggers, Socket.IO
│   ├── src/
│   │   ├── config/     # Zod validated environment configuration
│   │   ├── db/         # Knexfile, migrations, seeds (30 students, 7-day logs)
│   │   ├── jobs/       # node-cron daily expiry and nightly backups
│   │   ├── middlewares/# JWT auth, role guards, error handling, rate limiting
│   │   ├── routes/     # Auth, Students, Plans, Tokens, Meals, Reports, Staff
│   │   ├── services/   # Business transaction logic (Scan, Plan, Student, Backup)
│   │   ├── tests/      # 42 Vitest automated test cases
│   │   └── utils/      # AES-256-GCM crypto, JWT, IST timezone helpers, logger
├── dashboard/          # React 18 Admin Dashboard & Counter Screen
│   ├── src/
│   │   ├── api/        # Fetch client with auto JWT refresh
│   │   ├── components/ # AppLayout, Modal, Badge, Skeleton
│   │   ├── context/    # AuthContext, SocketContext
│   │   ├── pages/      # Login, Dashboard, Counter, Students, Plans, Logs, Reports, Staff
│   │   └── utils/      # Audio chime synthesizer
├── device-bridge/      # Biometric terminal bridge service
│   ├── src/
│   │   ├── drivers/    # MockDevice & ZkDevice (node-zklib)
│   │   └── types.ts    # FingerprintDevice interface
├── docs/               # Setup guide, staff counter guide, device failure guide
├── docker-compose.yml  # MySQL 8.0 containerized database
└── README.md
```

---

## Quick Start Guide

### 1. Start MySQL Database
Using Docker Compose:
```bash
docker compose up -d
```
*Or ensure native MySQL 8 is running locally on port 3306.*

### 2. Configure Environment
Copy `.env.example` to `.env` in the root directory:
```bash
cp .env.example .env
```

### 3. Run Migrations & Seed Data
```bash
npm run migrate
npm run seed
```

### 4. Start Development Servers
```bash
# In separate terminal windows or with concurrently:
npm run dev:backend    # http://localhost:4000
npm run dev:bridge     # http://localhost:4001
npm run dev:dashboard  # http://localhost:5173
```

Open `http://localhost:5173` in your browser.

### Default Login Accounts:
- **Owner Account**: `owner@mess.local` / `Owner@123456`
- **Counter Account**: `counter@mess.local` / `Counter@123456`

---

## Running the Automated Test Suite

```bash
npm test
```

42 tests verifying:
- AES-256-GCM encryption, decryption, and authentication tag tamper protection.
- MySQL triggers preventing `UPDATE` and `DELETE` on append-only tables.
- Double-deduction prevention under simultaneous concurrent requests.
- Scan rule validations: `NO_MATCH`, `INACTIVE_STUDENT`, `OUTSIDE_WINDOW`, `PLAN_EXPIRED`, `ALREADY_ATE`, `NO_BALANCE`.
- Role authorization (`OWNER` vs `COUNTER`).
- Biometric template privacy protection (templates never exposed in API responses).

---

## Documentation

- [Setup & Deployment Guide](docs/setup-guide.md)
- [Counter Staff Operating Guide](docs/staff-guide.md)
- [Device Failure & Recovery Guide](docs/device-failure-guide.md)
