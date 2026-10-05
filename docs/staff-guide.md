# Counter Staff Operating Guide: Mess Tokens

## 1. Introduction for Counter Staff

Welcome to the Mess Tokens Counter Screen. This guide covers how to operate the counter screen during breakfast, lunch, and dinner services.

---

## 2. Daily Workflow

### 2.1 Starting Service
1. Log in to the application at `http://localhost:5173` using your **Counter** account:
   - Email: `counter@mess.local`
   - Password: `Counter@123456`
2. You will be automatically redirected to the **Counter Screen** (`/counter`).
3. Check the **Device status pill** in the top header:
   - **Green ("Device online")**: Biometric terminal is communicating normally.
   - **Red ("Device offline")**: Device is disconnected. Follow the manual marking procedure below.

---

## 3. Biometric Scan Flow

1. Ask the student to place their registered finger flat on the fingerprint sensor.
2. The screen updates instantly:
   - **Green Card (Approved)**:
     - Shows student's photo, name, roll/code, tokens left, and plan validity.
     - A pleasant chime plays.
     - One token is deducted automatically.
     - The screen resets to "Waiting for fingerprint" after 4 seconds.
   - **Red Card (Rejected)**:
     - Shows the exact reason in plain words:
       - *"Plan expired on [date]"* &rarr; Advise student to renew their plan.
       - *"Already ate lunch today"* &rarr; Token already deducted for this window. Double deduction is prevented.
       - *"No tokens left"* &rarr; Student's token balance is 0.
       - *"Mess counter is currently closed"* &rarr; Scan happened outside scheduled meal hours.
       - *"Fingerprint not recognised"* &rarr; Ask student to retry with clean dry finger, or use their registered secondary finger.
     - A rejection tone plays.

---

## 4. Manual Fallback Procedure

If a student's fingerprint does not read (e.g. wet or oily fingers, skin cuts, or hardware issue), use the **Manual Fallback Panel** located on the counter screen:

1. In the search box, type the student's name, student code (e.g. `STU-2026-005`), or phone number.
2. Select the matching student from the dropdown. Verify their identity with the photo on screen.
3. Select a **Mandatory Reason**:
   - `Finger not reading / sensor dry`
   - `Wet or oily finger`
   - `Device down / hardware offline`
   - `Injury / bandage on finger`
   - `Other exception`
4. Click **Mark Meal**.
5. The system applies the **exact same rules** as a physical scan. If approved, 1 token is deducted, and the entry is permanently logged with your staff name and timestamp.
