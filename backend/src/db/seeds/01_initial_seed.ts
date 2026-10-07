import type { Knex } from 'knex';
import { hashPassword } from '../../utils/crypto';
import { env } from '../../config/env';

export async function seed(knex: Knex): Promise<void> {
  console.log('[Seed] Initializing system configurations...');

  // 1. Ensure Default Meal Windows exist
  const mealWindowCount = await knex('meal_windows').count<{ count: number | string }>('id as count').first();
  if (Number(mealWindowCount?.count || 0) === 0) {
    await knex('meal_windows').insert([
      {
        id: 1,
        name: 'Lunch',
        start_time: '11:30:00',
        end_time: '16:00:00',
        is_active: true,
        created_at: new Date(),
      },
      {
        id: 2,
        name: 'Dinner',
        start_time: '18:30:00',
        end_time: '22:30:00',
        is_active: true,
        created_at: new Date(),
      },
      {
        id: 3,
        name: 'Breakfast',
        start_time: '06:30:00',
        end_time: '11:30:00',
        is_active: true,
        created_at: new Date(),
      },
      {
        id: 4,
        name: 'Snacks',
        start_time: '16:00:00',
        end_time: '18:30:00',
        is_active: true,
        created_at: new Date(),
      },
    ]);
    console.log('[Seed] Created default meal windows.');
  }

  // 2. Ensure Default Plans exist
  const planCount = await knex('plans').count<{ count: number | string }>('id as count').first();
  if (Number(planCount?.count || 0) === 0) {
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
    console.log('[Seed] Created default subscription plans.');
  }

  // 3. Create Initial Owner if env variables are supplied and no owner exists
  const initialOwnerEmail = env.INITIAL_OWNER_EMAIL || process.env.INITIAL_OWNER_EMAIL;
  const initialOwnerPassword = env.INITIAL_OWNER_PASSWORD || process.env.INITIAL_OWNER_PASSWORD;
  const initialOwnerName = env.INITIAL_OWNER_NAME || process.env.INITIAL_OWNER_NAME || 'System Owner';

  if (initialOwnerEmail && initialOwnerPassword) {
    const existingOwner = await knex('admin_users').where({ role: 'OWNER' }).first();
    if (!existingOwner) {
      const passwordHash = await hashPassword(initialOwnerPassword);
      await knex('admin_users').insert({
        name: initialOwnerName,
        email: initialOwnerEmail.toLowerCase().trim(),
        password_hash: passwordHash,
        role: 'OWNER',
        is_active: true,
        must_change_password: true,
        failed_login_attempts: 0,
        created_at: new Date(),
      });
      console.log(`[Seed] Created initial owner from environment: ${initialOwnerEmail} (must change password on first login).`);
    } else {
      console.log('[Seed] An owner account already exists. Skipping initial owner creation.');
    }
  } else {
    console.log('[Seed] No INITIAL_OWNER_EMAIL/PASSWORD provided. Owner account will be created via /setup wizard on first launch.');
  }

  console.log('[Seed] Seed complete. System is ready for live authenticated operations without demo mock data.');
}
