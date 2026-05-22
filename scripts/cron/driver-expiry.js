import 'dotenv/config';
import mongoose from 'mongoose';
import connectDB from '../../config/db.js';
import { markExpiredDrivers } from '../../entities/driver/driver.scheduler.js';

async function run() {
  console.log('[Cron] Connecting to database...');
  await connectDB();

  console.log('[Cron] Running driver license expiry sweep...');
  await markExpiredDrivers();
}

run()
  .then(async () => {
    await mongoose.disconnect();
    console.log('[Cron] Driver license expiry job completed successfully.');
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('[Cron] Driver license expiry job failed:', err);
    try {
      await mongoose.disconnect();
    } catch (disErr) {
      console.error('[Cron] Error disconnecting database:', disErr);
    }
    process.exit(1);
  });
