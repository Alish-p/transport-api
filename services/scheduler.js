import Driver from '../entities/driver/driver.model.js';

// Schedule a task to run every day at local 00:00
function scheduleAtNextMidnight(task) {
  const now = new Date();
  const next = new Date(now);
  next.setHours(24, 0, 0, 0); // midnight of next day
  const delay = next.getTime() - now.getTime();

  setTimeout(async () => {
    try {
      await task();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Daily job failed:', err);
    } finally {
      // Re-schedule for the following midnight
      scheduleAtNextMidnight(task);
    }
  }, delay);
}

async function markExpiredDrivers() {
  const now = new Date();
  // Mark drivers as expired if licenseTo is in the past and not already marked
  const res = await Driver.updateMany(
    { licenseTo: { $lt: now }, expired: { $ne: true } },
    { $set: { expired: true } },
  );

  // eslint-disable-next-line no-console
  console.log(
    `[Cron] Driver license expiry sweep @ ${now.toISOString()} — matched: ${res.matchedCount ?? res.n}, modified: ${res.modifiedCount ?? res.nModified}`,
  );
}

export function startDailyDriverExpiryJob() {
  // eslint-disable-next-line no-console
  console.log('[Cron] Scheduling daily driver expiry job for 00:00 local time');
  scheduleAtNextMidnight(markExpiredDrivers);
}

export default {
  startDailyDriverExpiryJob,
};

