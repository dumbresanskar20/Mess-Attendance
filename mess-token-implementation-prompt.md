# Implementation prompt: Fingerprint meal-token system for a mess

Copy everything below the line into your AI coding tool (Claude Code, Antigravity, Cursor, etc.). Build in the phases listed at the end and stop after each phase for review.

---

## 1. Role and goal

You are a senior full-stack engineer. Build a production-quality **prepaid meal-token system for a mess (paid canteen)**. Students buy a plan (for example 60 tokens for 30 days, 2 meals a day). Each time a student eats, they place a finger on a fingerprint scanner and one token is deducted automatically. The software is used **only by the admin side** (owner and counter staff). There is **no student login, no student app and no QR or RFID**.

Work step by step, write clean typed code, add tests for the business rules, and explain any assumption you make in a short note before you build.

## 2. Fixed product decisions (do not change)

1. Identity is by **fingerprint only**. No QR, no RFID, no student panel.
2. The whole dashboard is **admin-only**. Two roles: `OWNER` (everything) and `COUNTER` (counter screen and student lookup only).
3. A student can register **multiple fingerprints** (minimum 2 recommended, maximum 5), each with a label such as "Right index".
4. **Fingerprint templates are stored in the database** (encrypted). The database is the source of truth; templates are pushed to the device from the database.
5. **Nothing is ever hard-deleted.** Students and fingerprints are deactivated with `is_active = false`. Ledger, meal log and audit log are append-only and must be protected from UPDATE and DELETE at the database level.
6. Exception: an OWNER-only, logged **purge** endpoint can permanently erase a student's fingerprint templates on request (biometric data is sensitive personal data). It removes the template data only and keeps the student's name, ledger and meal history.
7. **Manual fallback:** if the fingerprint does not work, an admin can mark the meal manually. It must pass the **same rules** as a scan, require a **reason**, and be flagged `method = MANUAL` with the staff user and time.
8. Currency is INR (₹). Timezone is `Asia/Kolkata`. All dates and times are stored in UTC and displayed in IST.

## 3. Tech stack

| Layer | Technology |
|---|---|
| Admin dashboard | React 18, Vite, TypeScript, Tailwind CSS, TanStack Table, Recharts, React Router, TanStack Query |
| Backend | Node.js, Express, TypeScript |
| Database | MySQL 8 (InnoDB) with Prisma or Knex migrations |
| Validation | Zod |
| Auth | JWT access and refresh tokens, bcrypt, role-based middleware |
| Real-time | Socket.IO (scan results pushed to the counter screen and dashboard) |
| Device bridge | Separate Node service; `node-zklib` for ZKTeco/eSSL style devices over LAN |
| Security | AES-256-GCM encryption for fingerprint templates, key from environment variable |
| Jobs | node-cron (plan expiry checks, nightly database backup) |
| Reports | exceljs (Excel), pdfkit (PDF) |
| Testing | Vitest or Jest for rules, Supertest for API, Playwright for the counter flow |

The system runs on **one PC at the mess** (backend, MySQL, dashboard) with the device on the same LAN, so the counter keeps working without internet. Add a nightly backup job (encrypted dump to a local folder, with an optional cloud upload hook).

## 3a. Device abstraction (important)

The real device may not be available during development. Define a `FingerprintDevice` interface and build **two drivers**:

- `MockDevice`: simulates scans from the dashboard (a dev-only "simulate scan" panel where you pick a student and finger) so the whole flow can be tested without hardware.
- `ZkDevice`: real driver using `node-zklib` (connect, enroll, read real-time scan events, upload and download templates, get device status). Isolate all vendor-specific code here so the device model can be swapped.

The bridge converts a device event (device user ID or matched template) into a call to `POST /api/scan` on the backend.

## 4. Repository structure

```
mess-tokens/
  dashboard/        React admin app (includes the counter screen)
  backend/          Express API, rules, jobs, Socket.IO
  device-bridge/    FingerprintDevice interface, MockDevice, ZkDevice
  db/               migrations and seed data
  docs/             setup guide, staff guide, device failure guide
  docker-compose.yml  (MySQL for development)
  README.md
```

## 5. Database schema (MySQL)

Create migrations for these tables with proper types, foreign keys and indexes. Use `BIGINT` ids and `DATETIME(3)` timestamps in UTC.

- `admin_users(id, name, email unique, password_hash, role ENUM('OWNER','COUNTER'), is_active, created_at)`
- `students(id, student_code unique, name, phone, photo_path, status ENUM('ACTIVE','INACTIVE'), consent_given_at, created_at, updated_at)`
- `fingerprints(id, student_id FK, finger_label, template_encrypted BLOB, iv, auth_tag, device_user_id, is_active, enrolled_by FK admin_users, enrolled_at, purged_at NULL)`
- `plans(id, name, price_inr, tokens, validity_days, meals_per_day, is_active)`
- `student_plans(id, student_id FK, plan_id FK, start_date, end_date, tokens_total, payment_mode ENUM('CASH','UPI','OTHER'), amount_paid_inr, sold_by FK admin_users, created_at)`
- `meal_windows(id, name, start_time, end_time, is_active)` (for example Lunch 12:00 to 15:00, Dinner 19:00 to 22:00)
- `token_ledger(id, student_id FK, student_plan_id FK, change_amount INT, reason ENUM('PLAN_PURCHASE','MEAL','MANUAL_ADJUST','EXPIRY','REFUND'), method ENUM('FINGERPRINT','MANUAL','SYSTEM'), meal_log_id NULL, note, created_by FK NULL, created_at)` — **append-only**
- `meal_log(id, student_id FK NULL, meal_window_id FK, meal_date DATE, method ENUM('FINGERPRINT','MANUAL'), fingerprint_id FK NULL, device_id, result ENUM('APPROVED','REJECTED'), reject_reason ENUM('NO_MATCH','PLAN_EXPIRED','NO_BALANCE','OUTSIDE_WINDOW','ALREADY_ATE','INACTIVE_STUDENT') NULL, marked_by FK NULL, manual_reason ENUM('FINGER_NOT_READING','WET_OR_OILY_FINGER','DEVICE_DOWN','INJURY','OTHER') NULL, created_at)` — **append-only**
- `audit_log(id, admin_id FK, action, target_type, target_id, detail JSON, ip, created_at)` — **append-only**

Constraints and protections:

- A **unique key** on approved meals: `(student_id, meal_window_id, meal_date)` for `result = 'APPROVED'` (use a generated column or a separate `approved_meals` table) so a double deduction is impossible even with two simultaneous scans.
- **Triggers** that raise an error on UPDATE or DELETE for `token_ledger`, `meal_log` and `audit_log`.
- Token balance is **computed from the ledger** (sum of `change_amount` for the active plan), never stored as an editable number. A SQL view `student_balances` exposes it.
- Indexes on `meal_log(meal_date, meal_window_id)`, `token_ledger(student_id, created_at)`, `fingerprints(student_id, is_active)`.

## 6. Business rules

### 6.1 Scan flow (`POST /api/scan`), one database transaction

1. Resolve the student from the fingerprint or device user ID. If no match, log `REJECTED / NO_MATCH` and return.
2. Student must be `ACTIVE`; otherwise `INACTIVE_STUDENT`.
3. The student must have an active plan covering today (`start_date <= today <= end_date`); otherwise `PLAN_EXPIRED`.
4. The current time must be inside an active meal window; otherwise `OUTSIDE_WINDOW`.
5. The student must not already have an approved meal for this window today; otherwise `ALREADY_ATE`.
6. Balance must be greater than zero (lock the plan row with `SELECT ... FOR UPDATE`); otherwise `NO_BALANCE`.
7. Insert the approved `meal_log` row and a `token_ledger` row with `change_amount = -1`, commit, then emit a Socket.IO event `scan:result` with student name, photo, remaining tokens and plan end date.
8. Every outcome, approved or rejected, writes a `meal_log` row. Return a clear result object.

Also block repeat scans from the same student within 2 minutes (treat as `ALREADY_ATE` for the same window).

### 6.2 Manual meal (`POST /api/meals/manual`)

Body: `studentId`, `manualReason`, optional `note`. Runs steps 2 to 7 above, stores `method = MANUAL`, `marked_by`, and `manual_reason`. A reason is mandatory. Write an audit log entry.

### 6.3 Other rules

- Selling a plan creates a `student_plans` row and a `+tokens` ledger entry (`PLAN_PURCHASE`) and records payment mode and amount.
- Manual token adjustments (`POST /api/tokens/adjust`) need an OWNER role, a numeric amount, and a reason; they write a ledger and an audit entry.
- A daily cron job at 00:05 IST finds expired plans and writes an `EXPIRY` ledger entry for leftover tokens only if the owner's policy setting says unused tokens expire (make this a setting, default off).
- Deactivating a student also deactivates all their fingerprints and removes them from the device; their history remains.

## 7. Fingerprint handling

- Enrollment flow: admin selects a student, clicks "Enroll finger", chooses a finger label, and the student scans 3 times on the device. The template is read from the device, **encrypted with AES-256-GCM** (store ciphertext, iv and auth tag), saved in `fingerprints`, and the student is registered on the device.
- Store **templates only**, never fingerprint images. Never return templates in any API response or log.
- Require `consent_given_at` (checkbox with date) before enrollment is allowed.
- Provide "Sync device" in the dashboard: re-upload all active templates from the database to the device, so a replaced device can be restored.
- Show a warning if a student has fewer than 2 active fingers, and a "Re-enroll" action when a student has frequent manual entries.

## 8. API endpoints

All routes under `/api`, validated with Zod, protected by JWT, and checked by role.

- Auth: `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`
- Students: `GET /students` (search, filter, paginate), `POST /students`, `GET /students/:id`, `PATCH /students/:id`, `POST /students/:id/deactivate`
- Fingerprints: `GET /students/:id/fingerprints`, `POST /students/:id/fingerprints/enroll`, `POST /fingerprints/:id/deactivate`, `POST /fingerprints/:id/purge` (OWNER)
- Plans: `GET/POST/PATCH /plans`, `POST /students/:id/plans` (sell a plan)
- Meals: `POST /scan`, `POST /meals/manual`, `GET /meals` (filters: date range, window, student, method, result)
- Tokens: `GET /students/:id/ledger`, `POST /tokens/adjust` (OWNER)
- Dashboard: `GET /dashboard/today`, `GET /dashboard/weekly`, `GET /dashboard/live`, `GET /dashboard/alerts`
- Reports: `GET /reports/monthly?format=xlsx|pdf`
- Admin: `GET/POST/PATCH /staff` (OWNER), `GET /audit`
- Device: `GET /device/status`, `POST /device/sync`

Use consistent error responses (`{ error: { code, message } }`), rate limiting on login, helmet, and CORS limited to the dashboard origin.

## 9. Admin dashboard visualization (build exactly this)

Design principles: flat, clean, light and dark mode aware, generous whitespace, 0.5 to 1px borders, 12px card radius, sentence case labels, no decorative effects. Desktop-first but usable on a tablet. Use Tailwind with a small design token layer (CSS variables for surface, text, border, success, warning, danger, accent).

### 9.1 App shell

- A **left sidebar** (about 180px) with the product name "Mess tokens" at the top and nav items with icons (use `lucide-react`): Dashboard, Counter, Students, Plans, Meal log, Reports, Staff and audit. The active item has a raised surface and medium weight. `COUNTER` role sees only Counter and Students (search and lookup).
- A **main content area** with a top bar showing the page title, today's date and the current meal window, and a **device status pill** (green "Device online" or red "Device offline") fed by `GET /device/status` and Socket.IO.

### 9.2 Dashboard page (`/`)

Top to bottom:

1. **Four metric cards** in a row:
   - "Lunch served" (or the current window) as `served / total active students`, for example `112 / 140`.
   - "Dinner expected" (count of active students with a valid plan, minus any who are known to be away; for now use active plan holders).
   - "Revenue today" in ₹ (sum of `amount_paid_inr` for plans sold today).
   - "Manual entries" (count of manual meals today); the card turns warning-colored if the share of manual entries today is above 10%.
2. A **two-column row**:
   - **Live scans** panel: the last 8 scans, newest first, updating in real time through Socket.IO. Each row shows time, student name, a method badge (`Finger` in accent, `Manual` in warning) and a result badge (`Approved` in success, or the reject reason in danger).
   - **Meals served, last 7 days** panel: a Recharts grouped bar chart with two series (lunch in purple, dinner in teal), day labels on the x-axis, a small legend, and tooltips with exact counts.
3. A **two-column row** of alert lists:
   - **Low balance**: students with 4 or fewer tokens, with a count badge and the remaining token count per row.
   - **Plans expiring this week**: student name and expiry date, soonest first, with a count badge. Clicking a row opens that student's profile.

Each panel needs loading skeletons, an empty state ("No scans yet. Scans appear here as students eat."), and an error state with a retry button. Refresh the metric cards every 30 seconds and the live panel through sockets.

### 9.3 Counter screen (`/counter`), the staff screen used during meals

- A header with the current meal window, the served count and the device status.
- A **large result card** that updates on each `scan:result` event:
  - Approved: green card (success background, 2px success border) with the student's **photo**, name, student code, plan name, **tokens left**, and plan end date.
  - Rejected: red card with the student's name if known, and the **exact reason** in plain words (for example "Plan expired on 4 Oct", "Already ate lunch", "No tokens left", "Fingerprint not recognised").
  - Idle: a calm "Waiting for fingerprint" state with a fingerprint icon.
  - Show the result for 4 seconds, then return to idle; play a short soft sound for approve and a different one for reject (user-mutable).
- A **manual fallback panel** titled "Fingerprint not reading? Mark meal manually": a student search box (name, code, or phone, with debounce and a results dropdown showing name, code and tokens left), a reason dropdown (finger not reading, wet or oily finger, device down, injury, other), a "Mark meal" button, and a helper line "Same rules as a scan. Logged with your name and time."
- A **recent scans** list of the last 5 results.
- A banner "Device offline. Use manual marking." when the bridge reports the device is down.
- In development mode only, a "Simulate scan" panel that drives the `MockDevice`.

### 9.4 Other pages

- **Students**: a table (code, name, phone, active plan, tokens left, plan end date, finger count, status) with search, filters (active, expiring, low balance, fewer than 2 fingers) and pagination. "Add student" opens a form with photo upload and a required consent checkbox.
- **Student profile**: header with photo and status; tabs for Plan and tokens (sell or renew a plan, adjust tokens), Fingerprints (list, enroll, deactivate, purge for OWNER, with consent date), Meal history, and Ledger. A warning banner appears if fewer than 2 fingers are enrolled.
- **Plans**: list and edit plan templates (name, price, tokens, validity days).
- **Meal log**: filterable table by date range, window, method, result and student, with CSV and Excel export.
- **Reports**: monthly summary (meals served per day, revenue, plans sold, manual entries per staff member) with Excel and PDF download.
- **Staff and audit** (OWNER): manage staff accounts and roles, and browse the audit log with filters.

### 9.5 UI quality bar

Accessible (labels, focus states, keyboard navigation on the counter screen), responsive layout, consistent badges (success, warning, danger, accent), skeleton loaders, toast confirmations for actions, and confirmation dialogs for destructive or sensitive actions (deactivate, purge, token adjust).

## 10. Non-functional requirements

- **Security:** bcrypt password hashing, short-lived access tokens with refresh rotation, role checks on every route, Zod input validation, rate limiting, parameterized queries only, encryption key in env (never in code), secrets in `.env.example` with placeholders.
- **Reliability:** database transactions for scan and manual flows, device reconnect with backoff in the bridge, clear "device offline" propagation, nightly backup job with a documented restore procedure.
- **Observability:** structured logs (pino), request ids, and no sensitive data (templates, passwords) in logs.
- **Seed data:** one OWNER account, one COUNTER account, 3 plans, 2 meal windows, and 30 sample students with plans and a week of meal history so the dashboard charts have data.

## 11. Testing requirements

Write automated tests, at minimum, for the scan rules:

- Approved scan deducts exactly one token and writes meal_log and ledger rows.
- Rejections for no match, inactive student, expired plan, outside window, already ate, and no balance.
- Two simultaneous scans for the same student and window result in exactly one approval.
- Window boundaries (start and end times) and the midnight date rollover in IST.
- Manual marking enforces the same rules, requires a reason, and is flagged as manual.
- UPDATE and DELETE on ledger, meal_log and audit_log fail.
- Role checks: COUNTER cannot adjust tokens, purge fingerprints or view staff.
- Fingerprint templates never appear in API responses.

Add one Playwright test for the counter flow using the `MockDevice`: simulate an approved scan, a rejected scan, and a manual marking.

## 12. Build phases (stop after each phase and summarize what to review)

1. **Foundation:** repo, docker-compose MySQL, migrations, triggers and views, auth with roles, seed data.
2. **Core data:** students, plans, selling a plan, ledger, audit logging, with tests.
3. **Scan engine:** `/scan`, manual meal, rules, concurrency protection, Socket.IO events, with the full test suite above.
4. **Device layer:** `FingerprintDevice` interface, `MockDevice`, `ZkDevice`, bridge service, enrollment flow with encryption and device sync.
5. **Dashboard UI:** app shell, dashboard page with the metric cards, live scans, weekly chart and alert lists, then the counter screen and the other pages as specified in section 9.
6. **Reports and hardening:** Excel and PDF reports, backups and restore, rate limiting, error states, README and docs (setup guide, staff guide, device-failure guide).

## 13. Acceptance criteria

- A student with two enrolled fingers can eat with either finger, and exactly one token is deducted per meal window.
- All rejections show the right reason on the counter screen within one second.
- A manual meal requires a reason, follows the same rules, and appears in the manual-entries metric and audit log.
- Ledger, meal log and audit log cannot be edited or deleted, even directly in SQL.
- The dashboard matches section 9 and updates live as scans come in.
- Fingerprint templates are encrypted in the database and never exposed through the API or logs.
- The whole flow can be demonstrated without hardware using the `MockDevice`, and the real device can be added by configuring `ZkDevice`.

Start with Phase 1. Before writing code, list the assumptions you are making and any questions you need answered.
