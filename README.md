<div align="center">

# 🍽️ Mess Tokens — Prepaid Biometric Meal System
### High-Concurrency Biometric Canteen Administration & Automated Token Deduction

[![Deployment Status](https://img.shields.io/badge/Deployment-Live%20on%20Vercel%20%26%20Render-brightgreen?style=for-the-badge&logo=vercel)](https://mess-attendance-six.vercel.app/)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React 18](https://img.shields.io/badge/React_18-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://react.dev/)
[![Node.js](https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![MySQL 8](https://img.shields.io/badge/MySQL_8.0-00758F?style=for-the-badge&logo=mysql&logoColor=white)](https://www.mysql.com/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![Docker](https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white)](https://www.docker.com/)

<p align="center">
  A production-ready, biometric-first prepaid meal management ecosystem engineered for college and hostel mess operations. Eliminates paper coupons, fraud, and physical queues with sub-second fingerprint authentication, immutable append-only ledger accounting, zero-hardware mock simulation, and a responsive admin experience.
</p>

[**🌐 Live Dashboard**](https://mess-attendance-six.vercel.app/) • [**⚡ REST API**](https://mess-attendance.onrender.com/) • [**🔌 Device Bridge**](https://mess-attendance-1.onrender.com/) • [**📖 Documentation**](#-documentation)

---

</div>

## 🌐 Live Deployments

| Component | Platform | Direct URL | Description |
|---|---|---|---|
| **Admin & Counter Dashboard** | **Vercel** | [https://mess-attendance-six.vercel.app/](https://mess-attendance-six.vercel.app/) | Responsive mobile & desktop client with real-time audio-visual scan feed |
| **Backend REST & Socket Engine** | **Render** | [https://mess-attendance.onrender.com/](https://mess-attendance.onrender.com/) | Express, Knex, Aiven MySQL Cloud, Socket.IO websocket broadcaster |
| **Biometric Device Bridge** | **Render** | [https://mess-attendance-1.onrender.com/](https://mess-attendance-1.onrender.com/) | Real-time ZKTeco/eSSL LAN listener and developer `MockDevice` simulator |

#### 🔑 Demo Credentials:
- **Owner Account**: `owner@mess.local` / `Owner@123456` *(Full system configuration, financial reports, ledger adjustment)*
- **Counter Staff Account**: `counter@mess.local` / `Counter@123456` *(Live counter scanning and student lookup)*

---

## 🏗️ High-Level System Architecture

```mermaid
flowchart TB
    subgraph Client["📱 Frontend Clients (Vercel)"]
        UI_Counter["⚡ Live Counter Screen\n(Real-time Audio Chimes)"]
        UI_Admin["📊 Admin Dashboard\n(Ledger, Analytics, Reports)"]
        UI_Mobile["📱 Mobile Drawer & Bottom Nav\n(Responsive Touch UI)"]
    end

    subgraph HardwareLayer["🔌 Biometric & Hardware Layer"]
        ZK_Device["🖐️ Physical ZKTeco/eSSL Terminal\n(LAN TCP/IP)"]
        Mock_Device["🧪 Virtual Mock Device\n(Zero-Hardware Dev Simulator)"]
        Bridge["🌉 Device Bridge Service\n(node-zklib & EventEmitter)"]
    end

    subgraph BackendLayer["⚙️ Core Backend Engine (Render)"]
        API["🛡️ Express REST API\n(Zod Validation, Rate Limiter, Helmet)"]
        Auth["🔐 JWT Auth & RBAC\n(OWNER vs COUNTER)"]
        SocketServer["📡 Socket.IO Broadcaster\n(scan:result realtime events)"]
        Crypto["🔒 AES-256-GCM Engine\n(Biometric Envelope Encryption)"]
        Cron["⏰ node-cron Scheduled Workers\n(Midnight Plan Expiry & Encrypted Dumps)"]
    end

    subgraph DatabaseLayer["🗄️ MySQL 8.0 InnoDB Storage (Aiven Cloud)"]
        T_Students["students\n(Consented Profiles)"]
        T_Fingerprints["fingerprints\n(AES Encrypted Templates)"]
        T_Plans["plans & student_plans\n(Validity, Pricing, Allowances)"]
        T_Windows["meal_windows\n(24h Operational Windows)"]
        T_Ledger["token_ledger\n(🛡️ Append-Only Invariant)"]
        T_Meals["meal_log\n(🛡️ Append-Only Invariant)"]
        T_Audit["audit_log\n(🛡️ Append-Only Invariant)"]
        V_Balances["student_balances\n(⚡ Dynamic SQL Computed View)"]
    end

    ZK_Device -->|TCP 4370| Bridge
    Mock_Device --> Bridge
    Bridge -->|POST /api/scan| API

    UI_Counter <-->|WebSockets| SocketServer
    UI_Admin <-->|REST + Bearer JWT| API
    UI_Mobile <-->|REST + Bearer JWT| API
    SocketServer --- API

    API --> Auth
    API --> Crypto
    API --> DatabaseLayer
    Cron --> DatabaseLayer
```

---

## ⚡ How It Works (Core Operational Workflows)

### 1. Unified Fingerprint Scan & Attendance Flow
Every meal scan is processed within a **single atomic database transaction** (`processScan`) with database-level race condition guards:

```mermaid
sequenceDiagram
    autonumber
    actor Student
    participant Scanner as 🖐️ Biometric Terminal
    participant Bridge as 🌉 Device Bridge
    participant Backend as ⚙️ Backend API
    participant DB as 🗄️ MySQL InnoDB
    participant Socket as 📡 Socket.IO
    participant Screen as 🖥️ Counter Screen

    Student->>Scanner: Places finger on reader
    Scanner->>Bridge: Emits device event (deviceUserId)
    Bridge->>Backend: POST /api/scan { deviceUserId }
    
    rect rgb(240, 248, 255)
        note over Backend,DB: Single Atomic Transaction (db.transaction)
        Backend->>DB: 1. Lookup student by deviceUserId
        Backend->>DB: 2. Lock student row FOR UPDATE
        Backend->>DB: 3. Verify status == 'ACTIVE'
        Backend->>DB: 4. Check active meal window (Breakfast, Lunch, Dinner, etc.)
        Backend->>DB: 5. Prevent double tap within 2 mins (ALREADY_ATE)
        Backend->>DB: 6. Verify active meal plan covering today
        Backend->>DB: 7. Check remaining balance > 0 from student_balances
        Backend->>DB: 8. Insert approved meal_log row
        Backend->>DB: 9. Append -1 change_amount to token_ledger
        Backend->>DB: 10. Commit transaction
    end

    Backend->>Socket: Emit 'scan:result' payload
    Socket->>Screen: Real-time broadcast
    Screen->>Screen: Play positive chime & display student photo
```

### 2. Manual Attendance Fallback
When hardware is offline, a sensor is smudged, or a student has a bandage, counter staff can mark attendance manually:
- Staff selects the student from the live search autocomplete.
- A **mandatory reason code** must be chosen (`FINGER_NOT_READING`, `WET_OR_OILY_FINGER`, `DEVICE_DOWN`, `INJURY`, `OTHER`).
- Runs the **exact same validation rules** as a physical scan.
- Automatically selects or overrides the active meal session without being blocked.
- Permanently logs `method = 'MANUAL'` along with the staff user's ID, reason, and IP into `audit_log`.

---

## ⏰ Continuous 24-Hour Meal Window Engine

Unlike rigid systems that lock out operations outside fixed hours, Mess Tokens implements a continuous 24-hour window system so breakfast, lunch, snacks, dinner, and late counters are always functional:

| Window ID | Session Name | Operating Hours (IST) | Description |
|:---:|:---|:---:|:---|
| **`1`** | **Lunch** | `11:30` – `16:00` | Midday meal service |
| **`2`** | **Dinner** | `18:30` – `22:30` | Evening meal service |
| **`3`** | **Breakfast** | `06:30` – `11:30` | Morning meal service |
| **`4`** | **Snacks** | `16:00` – `18:30` | Afternoon tea & snacks session |
| **`5`** | **Night / Counter** | `22:30` – `06:30` | Overnight canteen session & staff testing |

> [!TIP]
> **Counter Override**: The Counter Screen features an interactive **Meal Window Selector** in the header, enabling staff to switch or test specific meal windows on the fly without changing system clocks.

---

## 🔒 Security & Biometric Privacy Architecture

```mermaid
graph LR
    subgraph Enrollment["1. Biometric Enrollment"]
        Raw["Raw Fingerprint Template\n(From Reader)"] --> AES["AES-256-GCM\nEncryption Engine"]
        Secret["ENCRYPTION_KEY\n(32-Byte Secret)"] --> AES
        AES --> Cipher["template_encrypted (BLOB)\n+ iv (12B) + auth_tag (16B)"]
        Cipher --> DB[("MySQL fingerprints Table")]
    end

    subgraph Privacy["2. Zero-Leakage Guarantee"]
        DB --> API["REST API Endpoints"]
        API --> Sanitizer["JSON Output Sanitizer"]
        Sanitizer --> Out["Client Response\n(NEVER contains template/IV/key)"]
    end

    subgraph Purge["3. GDPR / Privacy Purge"]
        Owner["OWNER Staff Action"] --> PurgeEndpoint["POST /api/fingerprints/:id/purge"]
        PurgeEndpoint --> Clean["Purges encrypted blob only\n(Retains name, balance, history)"]
    end
```

- **Envelope Encryption**: Stored templates are secured with authenticated AES-256-GCM. Any manual tampering with the ciphertext triggers an authentication tag mismatch error.
- **Append-Only Triggers**: MySQL triggers on `token_ledger`, `meal_log`, and `audit_log` explicitly raise SQL exceptions on `UPDATE` or `DELETE`:
  ```sql
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Append-only table: UPDATE and DELETE are prohibited';
  ```
- **Double-Deduction Invariant**: An enforced database unique key on `(student_id, meal_window_id, meal_date)` for approved meals guarantees that concurrent scans can never result in duplicate deductions.

---

## 📁 Repository Directory Structure

```
Mess-Attendance/
├── 📂 backend/                      # Node.js + Express + Knex REST & WebSocket API
│   ├── 📂 src/
│   │   ├── 📂 config/               # Zod environment schema & application configuration
│   │   ├── 📂 db/                   # Knex connection, migrations, and seeds
│   │   │   ├── 📂 migrations/       # Schema migrations (tables, unique keys, triggers)
│   │   │   └── 📂 seeds/            # Initial dataset (admin users, windows, plans, students)
│   │   ├── 📂 jobs/                 # node-cron scheduled tasks (midnight expiry, backups)
│   │   ├── 📂 middlewares/          # JWT authentication, role guards, rate limiting, error handler
│   │   ├── 📂 routes/               # API route definitions
│   │   │   ├── auth.routes.ts       # Login, token refresh, logout, me
│   │   │   ├── student.routes.ts    # Student CRUD, biometric enrollment, purge
│   │   │   ├── plan.routes.ts       # Meal package creation and pricing
│   │   │   ├── token.routes.ts      # Plan purchase, token adjustment, ledger audit
│   │   │   ├── meal.routes.ts       # Fingerprint scan (/scan), manual meal, meal log, windows
│   │   │   ├── report.routes.ts     # Monthly attendance analytics, Excel, PDF generation
│   │   │   ├── staff.routes.ts      # Admin account management and audit trail
│   │   │   └── dashboard.routes.ts  # Daily KPI metrics, 7-day charts, alerts
│   │   ├── 📂 services/             # Core business transactions (Scan, Student, Token, Backup)
│   │   ├── 📂 tests/                # Automated test suite (42 Vitest specs)
│   │   └── 📂 utils/                # Crypto (AES-256-GCM), time (IST helpers), logger, time ranges
│   ├── package.json
│   └── tsconfig.json
│
├── 📂 dashboard/                    # React 18 + Vite + Tailwind CSS Single Page Application
│   ├── 📂 src/
│   │   ├── 📂 api/                  # Fetch client with automated JWT refresh interception
│   │   ├── 📂 components/           # Modular UI components
│   │   │   ├── 📂 layout/           # AppLayout (Responsive sidebar, mobile drawer, bottom nav)
│   │   │   ├── 📂 common/           # Modal, Badge, Skeleton, Dark mode toggle
│   │   │   └── 📂 biometrics/       # Fingerprint enrollment modal & scanner simulation
│   │   ├── 📂 context/              # AuthContext (roles, tokens) & SocketContext (realtime scans)
│   │   ├── 📂 pages/                # Route views
│   │   │   ├── LoginPage.tsx        # Authentication screen with quick-demo presets
│   │   │   ├── DashboardPage.tsx    # Live scan stream, Recharts 7-day breakdown, alerts
│   │   │   ├── CounterPage.tsx      # High-visibility scan feedback, window selector, manual fallback
│   │   │   ├── StudentsPage.tsx     # Student directory, mobile cards, search & filter pills
│   │   │   ├── StudentProfilePage.tsx # Token ledger, enrolled fingerprints, past meals, renewal
│   │   │   ├── PlansPage.tsx        # Meal plan creation, validity, price configuration
│   │   │   ├── MealLogPage.tsx      # Comprehensive audit log with CSV export
│   │   │   ├── ReportsPage.tsx      # Monthly reconciliation with Excel & PDF downloads
│   │   │   └── StaffAuditPage.tsx   # Staff accounts and immutable audit event stream
│   │   ├── 📂 utils/                # Synthesized Web Audio chime player
│   │   ├── App.tsx                  # Root routing & protected route wrappers
│   │   └── main.tsx                 # Entrypoint
│   ├── package.json
│   ├── tailwind.config.js
│   └── vite.config.ts
│
├── 📂 device-bridge/                # Biometric terminal bridge service
│   ├── 📂 src/
│   │   ├── 📂 drivers/
│   │   │   ├── zk.driver.ts         # node-zklib TCP driver for physical ZKTeco/eSSL hardware
│   │   │   └── mock.driver.ts       # Virtual MockDevice driver for zero-hardware simulation
│   │   ├── index.ts                 # Express server & socket listener
│   │   ├── types.ts                 # FingerprintDevice interface abstraction
│   │   └── urls.ts                  # Target backend service endpoints
│   ├── package.json
│   └── tsconfig.json
│
├── 📂 docs/                         # Operational manuals
│   ├── setup-guide.md               # Local, Docker, and Cloud deployment instructions
│   ├── staff-guide.md               # Operating instructions for mess counter staff
│   └── device-failure-guide.md      # Troubleshooting biometric scanner disconnections
│
├── docker-compose.yml               # Local MySQL 8.0 container service definition
├── package.json                     # Monorepo workspace configuration
└── README.md                        # Project documentation
```

---

## 📱 Mobile-First Responsive Design

The frontend admin interface has been engineered to deliver a seamless experience on both widescreen counter displays and mobile smartphones:

- **Slide-out Navigation Drawer**: Clean off-canvas navigation menu accessible via hamburger button on touch screens.
- **Fixed Mobile Bottom Navigation**: Quick 1-tap thumb navigation between key routes (**Dashboard**, **Counter**, **Students**, **Plans**, etc.) with zero overlapping content.
- **Touch-Friendly Student Cards**: On mobile screens (`< 768px`), table rows convert into dedicated cards displaying photos, remaining token counts, plan validity, and biometric counts.
- **Overflow-Protected Modals**: All dialogs dynamically size with scrollable viewports (`max-h-[90vh]`) to ensure buttons and inputs are always accessible on short or mobile screens.

---

## 🚀 Quick Start Guide

### 1. Prerequisites
- **Node.js** v18+ or v20+
- **Docker** (optional, for local MySQL) or local **MySQL 8.0**

### 2. Clone and Install Dependencies
```bash
git clone https://github.com/dumbresanskar20/Mess-Attendance.git
cd Mess-Attendance
npm install
```

### 3. Launch the MySQL Database
Using Docker Compose:
```bash
docker compose up -d
```
*Or configure your native MySQL instance on port 3306.*

### 4. Configure Environment Variables
Create `.env` in the repository root:
```env
PORT=4000
NODE_ENV=development
DATABASE_URL=mysql://mess_user:mess_password@127.0.0.1:3306/mess_attendance
JWT_SECRET=super-secret-jwt-key-minimum-32-characters-long
JWT_REFRESH_SECRET=super-secret-jwt-refresh-key-minimum-32-characters
ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
CORS_ORIGIN=http://localhost:5173
BRIDGE_PORT=4001
DEVICE_DRIVER=mock
```

### 5. Run Database Migrations & Seeds
```bash
npm run migrate
npm run seed
```

### 6. Start Development Servers
Run backend, bridge, and dashboard simultaneously:
```bash
# Run all workspace services in parallel:
npm run dev

# Or launch services individually:
npm run dev:backend    # Runs API on http://localhost:4000
npm run dev:bridge     # Runs Bridge on http://localhost:4001
npm run dev:dashboard  # Runs UI on http://localhost:5173
```

Visit **`http://localhost:5173`** and sign in using the demo accounts.

---

## 🧪 Automated Test Suite

The test suite validates biometric encryption, concurrency locks, triggers, and scan engine business rules:

```bash
npm test
```

```text
✓ src/tests/crypto.test.ts (6 tests)
  ✓ AES-256-GCM Encryption > should encrypt and decrypt biometric templates
  ✓ AES-256-GCM Encryption > should reject tampered authentication tags

✓ src/tests/db_triggers.test.ts (5 tests)
  ✓ Database Triggers > should prohibit UPDATE on token_ledger
  ✓ Database Triggers > should prohibit DELETE on meal_log
  ✓ Database Triggers > should prohibit DELETE on audit_log

✓ src/tests/auth.test.ts (6 tests)
  ✓ Role Guards > should authenticate OWNER and COUNTER roles
  ✓ Role Guards > should reject unauthorized token manipulation

✓ src/tests/scan_engine.test.ts (8 tests)
  ✓ Rules Engine > should reject scan on expired plans (PLAN_EXPIRED)
  ✓ Rules Engine > should reject scan when balance is 0 (NO_BALANCE)
  ✓ Rules Engine > should approve valid scan, deduct 1 token, and log meal
  ✓ Rules Engine > should handle simultaneous duplicate scans without double deduction
```

---

## 📖 Documentation

- 📘 [**Setup & Deployment Guide**](docs/setup-guide.md) — Detailed deployment walkthrough for local, Docker, and Render/Vercel cloud setups.
- 📙 [**Counter Staff Operating Guide**](docs/staff-guide.md) — Step-by-step operating guide for mess counter staff (scanning, manual entries, sound toggles).
- 📕 [**Device Failure & Recovery Guide**](docs/device-failure-guide.md) — Procedures for handling power outages, LAN disconnects, and fallback mechanisms.

---

## 📄 License
This project is licensed under the **MIT License**.
