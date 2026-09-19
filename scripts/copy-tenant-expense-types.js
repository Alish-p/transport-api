import path from 'path';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { fileURLToPath } from 'url';

import Tenant from '../entities/tenant/tenant.model.js';

// Resolve the root directory of the backend to load .env
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const { MONGO_URI } = process.env;

const DEFAULT_SOURCE_TENANT_ID = '6a986632272d8f5021606297'; // C & S LOGISTICS
const DEFAULT_TARGET_TENANT_IDS = [
  '6a95beb95b3ae38bf34a4561', // RUDRA GOODS CARRIER
  '6aa8175af5db4a116c2c341f', // M K Logistics
  '6a98655c272d8f5021605fcf', // M K Enterprise
];

async function run() {
  if (!MONGO_URI) {
    console.error('Error: MONGO_URI is not defined in environment variables.');
    process.exit(1);
  }

  const dryRun = process.argv.includes('--dryrun');
  const sourceId = process.env.SOURCE_TENANT_ID || DEFAULT_SOURCE_TENANT_ID;
  const targetIds = process.env.TARGET_TENANT_IDS
    ? process.env.TARGET_TENANT_IDS.split(',').map((id) => id.trim())
    : DEFAULT_TARGET_TENANT_IDS;

  console.log('----------------------------------------------------');
  console.log(`Mode: ${dryRun ? 'DRY RUN (No changes will be saved)' : 'WRITE MODE (Database updates will be applied)'}`);
  console.log(`Source Tenant ID: ${sourceId}`);
  console.log(`Target Tenant IDs: ${targetIds.join(', ')}`);
  console.log('----------------------------------------------------\n');

  try {
    console.log(`Connecting to MongoDB at: ${MONGO_URI.replace(/:([^:@]{3,})@/, ':****@')}`);
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB.\n');

    // Fetch Source Tenant
    const sourceTenant = await Tenant.findById(sourceId).lean();
    if (!sourceTenant) {
      throw new Error(`Source tenant with ID "${sourceId}" not found.`);
    }

    const sourceExpenseConfig = sourceTenant.config?.expense || {};
    const subtripExpenseTypes = sourceExpenseConfig['subtrip-expense-types'] || [];
    const vehicleExpenseTypes = sourceExpenseConfig['vehicle-expense-types'] || [];

    console.log(`Source Tenant: "${sourceTenant.name}" (${sourceTenant._id})`);
    console.log(`- Subtrip Expense Types: ${subtripExpenseTypes.length} items`);
    console.log(`- Vehicle Expense Types: ${vehicleExpenseTypes.length} items\n`);

    if (subtripExpenseTypes.length === 0 && vehicleExpenseTypes.length === 0) {
      throw new Error('Source tenant has no expense types configured.');
    }

    // Fetch Target Tenants
    const targetTenants = await Tenant.find({ _id: { $in: targetIds } }).lean();
    console.log(`Found ${targetTenants.length} of ${targetIds.length} target tenants.\n`);

    if (targetTenants.length === 0) {
      console.log('No matching target tenants found. Exiting.');
      return;
    }

    const bulkOps = [];

    for (const target of targetTenants) {
      const currentSubtripCount = target.config?.expense?.['subtrip-expense-types']?.length || 0;
      const currentVehicleCount = target.config?.expense?.['vehicle-expense-types']?.length || 0;

      console.log(`Target: "${target.name}" (${target._id})`);
      console.log(`  Current counts -> Subtrip: ${currentSubtripCount}, Vehicle: ${currentVehicleCount}`);
      console.log(`  New counts     -> Subtrip: ${subtripExpenseTypes.length}, Vehicle: ${vehicleExpenseTypes.length}`);

      bulkOps.push({
        updateOne: {
          filter: { _id: target._id },
          update: {
            $set: {
              'config.expense.subtrip-expense-types': subtripExpenseTypes,
              'config.expense.vehicle-expense-types': vehicleExpenseTypes,
            },
          },
        },
      });
    }

    if (dryRun) {
      console.log('\n[DRY RUN] Would execute bulk update on:');
      targetTenants.forEach((t) => console.log(`  - ${t.name} (${t._id})`));
      console.log('\nDry run complete. No modifications were made.');
    } else {
      console.log(`\nApplying updates to ${bulkOps.length} tenant(s)...`);
      const result = await Tenant.bulkWrite(bulkOps);
      console.log('Database updates successful!');
      console.log(`- Matched count:  ${result.matchedCount}`);
      console.log(`- Modified count: ${result.modifiedCount}`);
    }
  } catch (error) {
    console.error('Error during execution:', error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB.');
  }
}

run();
