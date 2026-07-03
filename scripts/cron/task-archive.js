import 'dotenv/config';
import mongoose from 'mongoose';

import connectDB from '../../config/db.js';
import { autoArchiveTasks } from '../../entities/task/task.scheduler.js';

async function run() {
  console.log('[Cron] Connecting to database...');
  await connectDB();

  console.log('[Cron] Running task archiving job...');
  await autoArchiveTasks();
}

run()
  .then(async () => {
    await mongoose.disconnect();
    console.log('[Cron] Task archiving job completed successfully.');
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('[Cron] Task archiving job failed:', err);
    try {
      await mongoose.disconnect();
    } catch (disErr) {
      console.error('[Cron] Error disconnecting database:', disErr);
    }
    process.exit(1);
  });
