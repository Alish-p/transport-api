import Driver from './driver.model.js';

export async function markExpiredDrivers() {
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
