import type { Knex } from 'knex';
import { hashPassword, encryptTemplate } from '../../utils/crypto';

export async function seed(knex: Knex): Promise<void> {
  // Clear existing data in correct FK order
  // Note: triggers on token_ledger, meal_log and audit_log prevent DELETE.
  // In seeds, we can disable foreign key checks and drop/re-insert or truncate if needed,
  // or temporarily drop triggers during seed reset.
  await knex.raw('SET FOREIGN_KEY_CHECKS = 0;');
  await knex.raw('DROP TRIGGER IF EXISTS trg_audit_log_no_delete;');
  await knex.raw('DROP TRIGGER IF EXISTS trg_audit_log_no_update;');
  await knex.raw('DROP TRIGGER IF EXISTS trg_meal_log_no_delete;');
  await knex.raw('DROP TRIGGER IF EXISTS trg_meal_log_no_update;');
  await knex.raw('DROP TRIGGER IF EXISTS trg_token_ledger_no_delete;');
  await knex.raw('DROP TRIGGER IF EXISTS trg_token_ledger_no_update;');

  await knex('audit_log').truncate();
  await knex('token_ledger').truncate();
  await knex('meal_log').truncate();
  await knex('student_plans').truncate();
  await knex('fingerprints').truncate();
  await knex('students').truncate();
  await knex('plans').truncate();
  await knex('meal_windows').truncate();
  await knex('admin_users').truncate();

  // 1. Create Admin Users
  const ownerPasswordHash = await hashPassword('Owner@123456');
  const counterPasswordHash = await hashPassword('Counter@123456');

  const [ownerId] = await knex('admin_users').insert([
    {
      name: 'Mess Owner',
      email: 'owner@mess.local',
      password_hash: ownerPasswordHash,
      role: 'OWNER',
      is_active: true,
      created_at: new Date(),
    },
    {
      name: 'Counter Staff',
      email: 'counter@mess.local',
      password_hash: counterPasswordHash,
      role: 'COUNTER',
      is_active: true,
      created_at: new Date(),
    },
  ]);

  const ownerUser = await knex('admin_users').where('email', 'owner@mess.local').first();
  const counterUser = await knex('admin_users').where('email', 'counter@mess.local').first();

  // 2. Create Plans
  await knex('plans').insert([
    {
      id: 1,
      name: 'Starter Plan (15 Days)',
      price_inr: 1800.0,
      tokens: 30,
      validity_days: 15,
      meals_per_day: 2,
      is_active: true,
      created_at: new Date(),
    },
    {
      id: 2,
      name: 'Standard Monthly (30 Days)',
      price_inr: 3300.0,
      tokens: 60,
      validity_days: 30,
      meals_per_day: 2,
      is_active: true,
      created_at: new Date(),
    },
    {
      id: 3,
      name: 'Executive Plan (45 Days)',
      price_inr: 4800.0,
      tokens: 90,
      validity_days: 45,
      meals_per_day: 2,
      is_active: true,
      created_at: new Date(),
    },
  ]);

  // 3. Create Meal Windows
  await knex('meal_windows').insert([
    {
      id: 1,
      name: 'Lunch',
      start_time: '12:00:00',
      end_time: '15:00:00',
      is_active: true,
      created_at: new Date(),
    },
    {
      id: 2,
      name: 'Dinner',
      start_time: '19:00:00',
      end_time: '22:00:00',
      is_active: true,
      created_at: new Date(),
    },
  ]);

  // 4. Create 30 Sample Students
  const sampleStudents = [
    { name: 'Aarav Sharma', phone: '9876500001' },
    { name: 'Aditi Patel', phone: '9876500002' },
    { name: 'Rohan Verma', phone: '9876500003' },
    { name: 'Sneha Deshmukh', phone: '9876500004' },
    { name: 'Vikram Joshi', phone: '9876500005' },
    { name: 'Ananya Iyer', phone: '9876500006' },
    { name: 'Kunal Malhotra', phone: '9876500007' },
    { name: 'Pooja Kulkarni', phone: '9876500008' },
    { name: 'Siddharth Rao', phone: '9876500009' },
    { name: 'Ishita Sen', phone: '9876500010' },
    { name: 'Rahul Nair', phone: '9876500011' },
    { name: 'Priya Reddy', phone: '9876500012' },
    { name: 'Varun Bhat', phone: '9876500013' },
    { name: 'Meera Chawla', phone: '9876500014' },
    { name: 'Aditya Gupta', phone: '9876500015' },
    { name: 'Kavita Menon', phone: '9876500016' },
    { name: 'Nikhil Mehta', phone: '9876500017' },
    { name: 'Divya Pillai', phone: '9876500018' },
    { name: 'Harsh Vardhan', phone: '9876500019' },
    { name: 'Ritu Agarwal', phone: '9876500020' },
    { name: 'Gaurav Saxena', phone: '9876500021' },
    { name: 'Tanvi Shah', phone: '9876500022' },
    { name: 'Arjun Kapoor', phone: '9876500023' },
    { name: 'Shreya Ghosh', phone: '9876500024' },
    { name: 'Manish Tiwari', phone: '9876500025' },
    { name: 'Preeti Bansal', phone: '9876500026' },
    { name: 'Deepak Mishra', phone: '9876500027' },
    { name: 'Simran Kaur', phone: '9876500028' },
    { name: 'Abhishek Jha', phone: '9876500029' },
    { name: 'Neha Singhal', phone: '9876500030' },
  ];

  const today = new Date();

  for (let i = 0; i < sampleStudents.length; i++) {
    const s = sampleStudents[i];
    const studentCode = `STU-2026-${String(i + 1).padStart(3, '0')}`;
    const status = i === 29 ? 'INACTIVE' : 'ACTIVE'; // 1 inactive student for testing
    const consentDate = new Date(today.getTime() - 25 * 86400000);

    const [studentId] = await knex('students').insert({
      id: i + 1,
      student_code: studentCode,
      name: s.name,
      phone: s.phone,
      photo_path: `https://api.dicebear.com/7.x/avataaars/svg?seed=${studentCode}`,
      status,
      consent_given_at: consentDate,
      created_at: consentDate,
      updated_at: consentDate,
    });

    // Enroll 2 fingerprints for most students, 1 for student 28 (to trigger warning)
    const fingerCount = i === 27 ? 1 : 2;
    const enrolledFingers = [
      { label: 'Right index', devId: `${i + 1}_1` },
      { label: 'Right thumb', devId: `${i + 1}_2` },
    ];

    for (let f = 0; f < fingerCount; f++) {
      const mockRawTemplate = `ZKT_TMPL_${studentCode}_FINGER_${f + 1}_${Date.now()}`;
      const encrypted = encryptTemplate(mockRawTemplate);

      await knex('fingerprints').insert({
        student_id: studentId,
        finger_label: enrolledFingers[f].label,
        template_encrypted: encrypted.ciphertext,
        iv: encrypted.iv,
        auth_tag: encrypted.authTag,
        device_user_id: enrolledFingers[f].devId,
        is_active: true,
        enrolled_by: ownerUser.id,
        enrolled_at: consentDate,
      });
    }

    // Assign plan
    // Configure dates: some started 20 days ago, some 10 days ago, some today
    let planId = (i % 3) + 1;
    let tokensTotal = planId === 1 ? 30 : planId === 2 ? 60 : 90;
    let validityDays = planId === 1 ? 15 : planId === 2 ? 30 : 45;
    let price = planId === 1 ? 1800 : planId === 2 ? 3300 : 4800;

    // Students 0-4: plan expiring within 3 days
    let daysAgo = 10;
    if (i < 5) {
      daysAgo = validityDays - 2; // Expiring in 2 days!
    } else if (i === 28) {
      daysAgo = validityDays + 5; // Expired 5 days ago!
    }

    const startDate = new Date(today.getTime() - daysAgo * 86400000);
    const endDate = new Date(startDate.getTime() + validityDays * 86400000);

    const [studentPlanId] = await knex('student_plans').insert({
      id: i + 1,
      student_id: studentId,
      plan_id: planId,
      start_date: startDate.toISOString().split('T')[0],
      end_date: endDate.toISOString().split('T')[0],
      tokens_total: tokensTotal,
      payment_mode: i % 2 === 0 ? 'UPI' : 'CASH',
      amount_paid_inr: price,
      sold_by: ownerUser.id,
      created_at: startDate,
    });

    // Token Ledger entry for plan purchase
    await knex('token_ledger').insert({
      student_id: studentId,
      student_plan_id: studentPlanId,
      change_amount: tokensTotal,
      reason: 'PLAN_PURCHASE',
      method: 'SYSTEM',
      note: `Initial plan purchase: ${tokensTotal} tokens`,
      created_by: ownerUser.id,
      created_at: startDate,
    });
  }

  // 5. Seed Past 7 Days of Meals (for Recharts weekly chart)
  // Day -6 to Day 0 (today)
  const students = await knex('students').where('status', 'ACTIVE');
  const fingerprints = await knex('fingerprints').where('is_active', true);

  for (let d = 6; d >= 0; d--) {
    const mealDate = new Date(today.getTime() - d * 86400000);
    const dateStr = mealDate.toISOString().split('T')[0];

    // Lunch Window (Window 1)
    for (let sIdx = 0; sIdx < 20; sIdx++) {
      const student = students[sIdx];
      const studentFinger = fingerprints.find((f) => String(f.student_id) === String(student.id));
      const sPlan = await knex('student_plans').where('student_id', student.id).first();

      const isManual = sIdx % 10 === 9; // ~10% manual entries
      const method = isManual ? 'MANUAL' : 'FINGERPRINT';
      const manualReason = isManual ? 'WET_OR_OILY_FINGER' : null;

      const [mealLogId] = await knex('meal_log').insert({
        student_id: student.id,
        meal_window_id: 1,
        meal_date: dateStr,
        method,
        fingerprint_id: isManual ? null : studentFinger?.id || null,
        device_id: 'DEV-MAIN-COUNTER',
        result: 'APPROVED',
        marked_by: isManual ? counterUser.id : null,
        manual_reason: manualReason,
        created_at: new Date(`${dateStr}T12:${String(10 + sIdx).padStart(2, '0')}:00Z`),
      });

      // Deduct token in ledger
      await knex('token_ledger').insert({
        student_id: student.id,
        student_plan_id: sPlan.id,
        change_amount: -1,
        reason: 'MEAL',
        method: isManual ? 'MANUAL' : 'FINGERPRINT',
        meal_log_id: mealLogId,
        note: `Lunch meal on ${dateStr}`,
        created_by: isManual ? counterUser.id : null,
        created_at: new Date(`${dateStr}T12:${String(10 + sIdx).padStart(2, '0')}:00Z`),
      });
    }

    // Dinner Window (Window 2) - for days prior to today, or earlier today
    if (d > 0) {
      for (let sIdx = 2; sIdx < 22; sIdx++) {
        const student = students[sIdx];
        const studentFinger = fingerprints.find((f) => String(f.student_id) === String(student.id));
        const sPlan = await knex('student_plans').where('student_id', student.id).first();

        const [mealLogId] = await knex('meal_log').insert({
          student_id: student.id,
          meal_window_id: 2,
          meal_date: dateStr,
          method: 'FINGERPRINT',
          fingerprint_id: studentFinger?.id || null,
          device_id: 'DEV-MAIN-COUNTER',
          result: 'APPROVED',
          created_at: new Date(`${dateStr}T19:${String(15 + sIdx).padStart(2, '0')}:00Z`),
        });

        // Deduct token in ledger
        await knex('token_ledger').insert({
          student_id: student.id,
          student_plan_id: sPlan.id,
          change_amount: -1,
          reason: 'MEAL',
          method: 'FINGERPRINT',
          meal_log_id: mealLogId,
          note: `Dinner meal on ${dateStr}`,
          created_at: new Date(`${dateStr}T19:${String(15 + sIdx).padStart(2, '0')}:00Z`),
        });
      }
    }
  }

  // 6. Make a couple of students have low balance (<= 4 tokens) for the dashboard alert widget
  // Let's adjust student 1 and 2 tokens to have 2 and 3 tokens remaining
  const s1Plan = await knex('student_plans').where('student_id', 1).first();
  const s2Plan = await knex('student_plans').where('student_id', 2).first();

  const [s1Bal] = await knex('student_balances').where('student_id', 1);
  if (s1Bal && s1Bal.balance > 2) {
    await knex('token_ledger').insert({
      student_id: 1,
      student_plan_id: s1Plan.id,
      change_amount: -(s1Bal.balance - 2),
      reason: 'MANUAL_ADJUST',
      method: 'MANUAL',
      note: 'Simulated balance consumption for testing alerts',
      created_by: ownerUser.id,
      created_at: new Date(),
    });
  }

  const [s2Bal] = await knex('student_balances').where('student_id', 2);
  if (s2Bal && s2Bal.balance > 3) {
    await knex('token_ledger').insert({
      student_id: 2,
      student_plan_id: s2Plan.id,
      change_amount: -(s2Bal.balance - 3),
      reason: 'MANUAL_ADJUST',
      method: 'MANUAL',
      note: 'Simulated balance consumption for testing alerts',
      created_by: ownerUser.id,
      created_at: new Date(),
    });
  }

  // 7. Re-enable Triggers & FK Checks
  await knex.raw(`
    CREATE TRIGGER trg_token_ledger_no_update
    BEFORE UPDATE ON token_ledger
    FOR EACH ROW
    BEGIN
      SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'token_ledger is append-only: UPDATE is prohibited';
    END;
  `);

  await knex.raw(`
    CREATE TRIGGER trg_token_ledger_no_delete
    BEFORE DELETE ON token_ledger
    FOR EACH ROW
    BEGIN
      SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'token_ledger is append-only: DELETE is prohibited';
    END;
  `);

  await knex.raw(`
    CREATE TRIGGER trg_meal_log_no_update
    BEFORE UPDATE ON meal_log
    FOR EACH ROW
    BEGIN
      SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'meal_log is append-only: UPDATE is prohibited';
    END;
  `);

  await knex.raw(`
    CREATE TRIGGER trg_meal_log_no_delete
    BEFORE DELETE ON meal_log
    FOR EACH ROW
    BEGIN
      SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'meal_log is append-only: DELETE is prohibited';
    END;
  `);

  await knex.raw(`
    CREATE TRIGGER trg_audit_log_no_update
    BEFORE UPDATE ON audit_log
    FOR EACH ROW
    BEGIN
      SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'audit_log is append-only: UPDATE is prohibited';
    END;
  `);

  await knex.raw(`
    CREATE TRIGGER trg_audit_log_no_delete
    BEFORE DELETE ON audit_log
    FOR EACH ROW
    BEGIN
      SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'audit_log is append-only: DELETE is prohibited';
    END;
  `);

  await knex.raw('SET FOREIGN_KEY_CHECKS = 1;');
}
