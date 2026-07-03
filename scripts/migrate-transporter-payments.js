import path from 'path';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { fileURLToPath } from 'url';

// Import Models
import TransporterPayment from '../entities/transporterPayment/transporterPayment.model.js';

// Resolve the root directory of the backend to load .env
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const {MONGO_URI} = process.env;

async function run() {
  if (!MONGO_URI) {
    console.error('Error: MONGO_URI is not defined in the environment variables.');
    process.exit(1);
  }

  const dryRun = process.argv.includes('--dryrun');
  if (dryRun) {
    console.log('=== RUNNING IN DRY RUN MODE (No changes will be saved to the database) ===\n');
  } else {
    console.log('=== RUNNING IN WRITE MODE (Changes will be applied to the database) ===\n');
  }

  try {
    console.log(`Connecting to MongoDB at: ${MONGO_URI}`);
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB.\n');

    // Query transporter payments where subtripSnapshot has at least one element lacking freightDetails or commissionDetails
    const query = {
      subtripSnapshot: {
        $elemMatch: {
          $or: [
            { freightDetails: { $exists: false } },
            { commissionDetails: { $exists: false } }
          ]
        }
      }
    };

    console.log('Scanning for transporter payments needing snapshot migration...');
    const payments = await TransporterPayment.find(query).lean();
    console.log(`Found ${payments.length} transporter payments needing migration.\n`);

    if (payments.length === 0) {
      console.log('No legacy transporter payment snapshots found. Migration is not needed.');
      return;
    }

    const bulkOps = [];
    let totalSnapshotsMigrated = 0;

    for (const payment of payments) {
      let isModified = false;
      const updatedSnapshots = [];
      for (const snapshot of payment.subtripSnapshot) {
        let snapshotModified = false;
        const newSnapshot = { ...snapshot };

        // 1. Populate freightDetails if missing
        if (!newSnapshot.freightDetails) {
          newSnapshot.freightDetails = {
            freightModel: 'per_ton',
            rate: newSnapshot.rate ?? 0,
            freightAmount: newSnapshot.freightAmount ?? 0,
          };
          snapshotModified = true;
        }

        // 2. Populate commissionDetails if missing
        if (!newSnapshot.commissionDetails) {
          const rate = newSnapshot.commissionRate ?? 0;
          const weight = newSnapshot.loadingWeight ?? 0;
          newSnapshot.commissionDetails = {
            commissionRate: rate,
            commissionAmount: rate * weight,
          };
          snapshotModified = true;
        }

        if (snapshotModified) {
          totalSnapshotsMigrated += 1;
          isModified = true;
        }

        updatedSnapshots.push(newSnapshot);
      }

      if (isModified) {
        bulkOps.push({
          updateOne: {
            filter: { _id: payment._id },
            update: {
              $set: { subtripSnapshot: updatedSnapshots }
            }
          }
        });

        if (dryRun) {
          console.log(`Transporter Payment ID: ${payment.paymentId || 'N/A'} (ID: ${payment._id})`);
          console.log(`  - Migrating snapshots:`);
          updatedSnapshots.forEach(s => {
            console.log(`    * Subtrip No: ${s.subtripNo}`);
            console.log(`      freightDetails:`, JSON.stringify(s.freightDetails));
            console.log(`      commissionDetails:`, JSON.stringify(s.commissionDetails));
          });
          console.log();
        }
      }
    }

    console.log(`Summary of changes to apply:`);
    console.log(`- Payments to update: ${bulkOps.length}`);
    console.log(`- Snapshot elements migrated: ${totalSnapshotsMigrated}\n`);

    if (bulkOps.length === 0) {
      console.log('No updates need to be performed.');
      return;
    }

    if (dryRun) {
      console.log('Dry run complete. No modifications were made to the database.');
    } else {
      console.log('Executing database updates...');
      const result = await TransporterPayment.bulkWrite(bulkOps);
      console.log('Database updates successful!');
      console.log(`- Matched count: ${result.matchedCount}`);
      console.log(`- Modified count: ${result.modifiedCount}`);
    }

  } catch (error) {
    console.error('Migration failed with error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB.');
  }
}

run();
