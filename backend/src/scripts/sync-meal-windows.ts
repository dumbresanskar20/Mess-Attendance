import { db } from '../db/connection';

async function syncMealWindows() {
  console.log('Checking and syncing meal_windows...');

  // Ensure window 1 (Lunch)
  const win1 = await db('meal_windows').where('id', 1).first();
  if (win1) {
    await db('meal_windows').where('id', 1).update({
      name: 'Lunch',
      start_time: '11:30:00',
      end_time: '16:00:00',
      is_active: true,
    });
  } else {
    await db('meal_windows').insert({
      id: 1,
      name: 'Lunch',
      start_time: '11:30:00',
      end_time: '16:00:00',
      is_active: true,
      created_at: new Date(),
    });
  }

  // Ensure window 2 (Dinner)
  const win2 = await db('meal_windows').where('id', 2).first();
  if (win2) {
    await db('meal_windows').where('id', 2).update({
      name: 'Dinner',
      start_time: '18:30:00',
      end_time: '22:30:00',
      is_active: true,
    });
  } else {
    await db('meal_windows').insert({
      id: 2,
      name: 'Dinner',
      start_time: '18:30:00',
      end_time: '22:30:00',
      is_active: true,
      created_at: new Date(),
    });
  }

  // Ensure window 3 (Breakfast)
  const win3 = await db('meal_windows').where('id', 3).first();
  if (!win3) {
    await db('meal_windows').insert({
      id: 3,
      name: 'Breakfast',
      start_time: '06:30:00',
      end_time: '11:30:00',
      is_active: true,
      created_at: new Date(),
    });
  } else {
    await db('meal_windows').where('id', 3).update({
      name: 'Breakfast',
      start_time: '06:30:00',
      end_time: '11:30:00',
      is_active: true,
    });
  }

  // Ensure window 4 (Snacks)
  const win4 = await db('meal_windows').where('id', 4).first();
  if (!win4) {
    await db('meal_windows').insert({
      id: 4,
      name: 'Snacks',
      start_time: '16:00:00',
      end_time: '18:30:00',
      is_active: true,
      created_at: new Date(),
    });
  } else {
    await db('meal_windows').where('id', 4).update({
      name: 'Snacks',
      start_time: '16:00:00',
      end_time: '18:30:00',
      is_active: true,
    });
  }

  // Ensure window 5 (Night / Counter)
  const win5 = await db('meal_windows').where('id', 5).first();
  if (!win5) {
    await db('meal_windows').insert({
      id: 5,
      name: 'Night / Counter',
      start_time: '22:30:00',
      end_time: '06:30:00',
      is_active: true,
      created_at: new Date(),
    });
  } else {
    await db('meal_windows').where('id', 5).update({
      name: 'Night / Counter',
      start_time: '22:30:00',
      end_time: '06:30:00',
      is_active: true,
    });
  }

  const all = await db('meal_windows').select('*').orderBy('id', 'asc');
  console.log('Updated meal windows in DB:');
  console.table(all);
  process.exit(0);
}

syncMealWindows().catch((err) => {
  console.error('Failed to sync meal windows:', err);
  process.exit(1);
});
