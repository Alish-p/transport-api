import path from 'path';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { fileURLToPath } from 'url';

// Import Models
import Invoice from '../entities/invoice/invoice.model.js';

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

    // Query invoices where subtripSnapshot has at least one element lacking freightDetails
    const query = {
      subtripSnapshot: {
        $elemMatch: {
          freightDetails: { $exists: false }
        }
      }
    };

    console.log('Scanning for invoices needing snapshot migration...');
    const invoices = await Invoice.find(query).lean();
    console.log(`Found ${invoices.length} invoices needing migration.\n`);

    if (invoices.length === 0) {
      console.log('No legacy invoice snapshots found. Migration is not needed.');
      return;
    }

    const bulkOps = [];
    let totalSnapshotsMigrated = 0;

    for (const invoice of invoices) {
      let isModified = false;
      const updatedSnapshots = invoice.subtripSnapshot.map((snapshot) => {
        // If snapshot is missing freightDetails, migrate it
        if (!snapshot.freightDetails) {
          isModified = true;
          totalSnapshotsMigrated++;
          return {
            ...snapshot,
            freightDetails: {
              freightModel: 'per_ton',
              rate: snapshot.rate ?? 0,
              freightAmount: snapshot.freightAmount ?? 0
            }
          };
        }
        return snapshot;
      });

      if (isModified) {
        bulkOps.push({
          updateOne: {
            filter: { _id: invoice._id },
            update: {
              $set: { subtripSnapshot: updatedSnapshots }
            }
          }
        });

        if (dryRun) {
          console.log(`Invoice: ${invoice.invoiceNo} (ID: ${invoice._id})`);
          console.log(`  - Migrating snapshots:`);
          updatedSnapshots.forEach(s => {
            console.log(`    * Subtrip No: ${s.subtripNo}`);
            console.log(`      rate: ${s.rate} -> freightDetails.rate: ${s.freightDetails.rate}`);
            console.log(`      freightAmount: ${s.freightAmount} -> freightDetails.freightAmount: ${s.freightDetails.freightAmount}`);
          });
          console.log();
        }
      }
    }

    console.log(`Summary of changes to apply:`);
    console.log(`- Invoices to update: ${bulkOps.length}`);
    console.log(`- Snapshot elements migrated: ${totalSnapshotsMigrated}\n`);

    if (bulkOps.length === 0) {
      console.log('No updates need to be performed.');
      return;
    }

    if (dryRun) {
      console.log('Dry run complete. No modifications were made to the database.');
    } else {
      console.log('Executing database updates...');
      const result = await Invoice.bulkWrite(bulkOps);
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
