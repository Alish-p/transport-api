import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Resolve the root directory of the backend to load .env
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

// Import Models
import Subtrip from '../entities/subtrip/subtrip.model.js';

const MONGO_URI = process.env.MONGO_URI;

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

    // Query subtrips that have rate or commissionRate defined at the root level
    const query = {
      $or: [
        { rate: { $exists: true, $ne: null } },
        { commissionRate: { $exists: true, $ne: null } }
      ]
    };

    console.log('Scanning for subtrips needing migration...');
    const subtrips = await Subtrip.find(query).lean();
    console.log(`Found ${subtrips.length} subtrips matching legacy criteria.\n`);

    if (subtrips.length === 0) {
      console.log('No legacy subtrips found. Migration is not needed.');
      return;
    }

    const bulkOps = [];
    let rateMigratedCount = 0;
    let commissionMigratedCount = 0;

    for (const subtrip of subtrips) {
      const setFields = {};
      const unsetFields = {};

      // 1. Handle rate -> freightDetails.rate
      if (subtrip.rate !== undefined && subtrip.rate !== null) {
        const currentRate = subtrip.freightDetails?.rate;
        if (currentRate === undefined || currentRate === null) {
          setFields['freightDetails.rate'] = subtrip.rate;
          setFields['freightDetails.freightModel'] = subtrip.freightDetails?.freightModel || 'per_ton';

          // Calculate freightAmount if not already defined
          if (subtrip.freightDetails?.freightAmount === undefined || subtrip.freightDetails?.freightAmount === null) {
            const loadingWeight = subtrip.loadingWeight || 0;
            setFields['freightDetails.freightAmount'] = subtrip.rate * loadingWeight;
          }
          rateMigratedCount++;
        }
        unsetFields.rate = '';
      }

      // 2. Handle commissionRate -> commissionDetails.commissionRate
      if (subtrip.commissionRate !== undefined && subtrip.commissionRate !== null) {
        const currentCommissionRate = subtrip.commissionDetails?.commissionRate;
        if (currentCommissionRate === undefined || currentCommissionRate === null) {
          setFields['commissionDetails.commissionRate'] = subtrip.commissionRate;

          // Calculate commissionAmount if not already defined
          if (subtrip.commissionDetails?.commissionAmount === undefined || subtrip.commissionDetails?.commissionAmount === null) {
            const loadingWeight = subtrip.loadingWeight || 0;
            setFields['commissionDetails.commissionAmount'] = subtrip.commissionRate * loadingWeight;
          }
          commissionMigratedCount++;
        }
        unsetFields.commissionRate = '';
      }

      if (Object.keys(setFields).length > 0 || Object.keys(unsetFields).length > 0) {
        const op = {
          updateOne: {
            filter: { _id: subtrip._id },
            update: {}
          }
        };

        if (Object.keys(setFields).length > 0) {
          op.updateOne.update.$set = setFields;
        }
        if (Object.keys(unsetFields).length > 0) {
          op.updateOne.update.$unset = unsetFields;
        }

        bulkOps.push(op);

        if (dryRun) {
          console.log(`Subtrip: ${subtrip.subtripNo} (ID: ${subtrip._id})`);
          console.log(`  - Original: rate: ${subtrip.rate}, commissionRate: ${subtrip.commissionRate}, loadingWeight: ${subtrip.loadingWeight ?? 'N/A'}`);
          if (Object.keys(setFields).length > 0) {
            console.log(`  - Set:`, JSON.stringify(setFields, null, 2));
          }
          if (Object.keys(unsetFields).length > 0) {
            console.log(`  - Unset:`, JSON.stringify(Object.keys(unsetFields)));
          }
          console.log();
        }
      }
    }

    console.log(`Summary of changes to apply:`);
    console.log(`- Subtrips to update: ${bulkOps.length}`);
    console.log(`- Rates migrated: ${rateMigratedCount}`);
    console.log(`- Commission rates migrated: ${commissionMigratedCount}\n`);

    if (bulkOps.length === 0) {
      console.log('No updates need to be performed.');
      return;
    }

    if (dryRun) {
      console.log('Dry run complete. No modifications were made to the database.');
    } else {
      console.log('Executing database updates...');
      const result = await Subtrip.bulkWrite(bulkOps);
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
