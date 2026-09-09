/**
 * Migration Script: Add status field to existing Expense documents
 *
 * This script backfills the `status` field on all existing expense documents
 * that were created before the soft-cancel feature was introduced.
 *
 * Usage:
 *   node scripts/migrate-expense-status.js
 *
 * What it does:
 *   - Sets `status: 'Recorded'` on all expenses that don't have a status field
 *   - This is idempotent — safe to run multiple times
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;

async function migrate() {
  if (!MONGO_URI) {
    console.error('MONGO_URI environment variable is not set');
    process.exit(1);
  }

  console.log('Connecting to MongoDB...');
  await mongoose.connect(MONGO_URI);
  console.log('Connected.');

  const db = mongoose.connection.db;

  // Backfill expenses
  const expenseResult = await db.collection('expenses').updateMany(
    { status: { $exists: false } },
    { $set: { status: 'Recorded' } }
  );
  console.log(`Expenses updated: ${expenseResult.modifiedCount} documents set to 'Recorded'`);

  // Verify no null statuses remain
  const nullCount = await db.collection('expenses').countDocuments({
    $or: [{ status: { $exists: false } }, { status: null }],
  });
  console.log(`Expenses without status remaining: ${nullCount}`);

  // Note: TransporterAdvance already has status field with default 'Pending',
  // so no migration is needed for advances. But let's verify:
  const advanceNullCount = await db.collection('transporteradvances').countDocuments({
    $or: [{ status: { $exists: false } }, { status: null }],
  });
  if (advanceNullCount > 0) {
    console.log(`Found ${advanceNullCount} advances without status. Fixing...`);
    const advResult = await db.collection('transporteradvances').updateMany(
      { $or: [{ status: { $exists: false } }, { status: null }] },
      { $set: { status: 'Pending' } }
    );
    console.log(`Advances updated: ${advResult.modifiedCount} documents set to 'Pending'`);
  } else {
    console.log('All advances already have a status field. No migration needed.');
  }

  await mongoose.disconnect();
  console.log('Migration complete.');
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
