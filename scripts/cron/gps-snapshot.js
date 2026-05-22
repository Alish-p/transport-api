import 'dotenv/config';
import mongoose from 'mongoose';
import connectDB from '../../config/db.js';
import { recordGpsSnapshots } from '../../entities/gpsSnapshot/gpsSnapshot.scheduler.js';

async function run() {
  console.log('[Cron] Connecting to database...');
  await connectDB();

  console.log('[Cron] Running GPS snapshot recorder job...');
  await recordGpsSnapshots();
}

run()
  .then(async () => {
    await mongoose.disconnect();
    console.log('[Cron] GPS snapshot recording job completed successfully.');
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('[Cron] GPS snapshot recording job failed:', err);
    try {
      await mongoose.disconnect();
    } catch (disErr) {
      console.error('[Cron] Error disconnecting database:', disErr);
    }
    process.exit(1);
  });
