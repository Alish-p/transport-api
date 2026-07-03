import path from 'path';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { fileURLToPath } from 'url';

// Import Models
import Tenant from '../entities/tenant/tenant.model.js';

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

    console.log('Scanning for tenants needing config migration...');
    const tenants = await Tenant.find({}).lean();
    console.log(`Found ${tenants.length} tenants total.\n`);

    const bulkOps = [];

    for (const tenant of tenants) {
      const config = tenant.config || {};
      
      // Check if any old fields exist directly under config
      const hasOldFields = [
        'marketVehicles', 'pumps', 'materialOptions', 'subtripExpenseTypes',
        'vehicleExpenseTypes', 'vehicleTypes', 'vehicleCompanies',
        'vehicleModels', 'engineTypes', 'defaultTdsPercentage',
        'defaultPodCharges', 'transporterPaymentTemplate',
        'defaultInvoiceDueInDays', 'defaultTaxRates', 'invoiceTermsAndConditions'
      ].some(field => field in config);

      if (!hasOldFields) {
        console.log(`Tenant ${tenant.name} (${tenant.slug}) has already been migrated or has no legacy config.`);
        continue;
      }

      const $set = {};
      const $unset = {};

      // vehicleConfig mapping
      if ('marketVehicles' in config) {
        $set['config.vehicle.marketVehicles'] = config.marketVehicles;
        $unset['config.marketVehicles'] = '';
      }
      if ('vehicleTypes' in config) {
        $set['config.vehicle.types'] = config.vehicleTypes;
        $unset['config.vehicleTypes'] = '';
      }
      if ('vehicleCompanies' in config) {
        $set['config.vehicle.companies'] = config.vehicleCompanies;
        $unset['config.vehicleCompanies'] = '';
      }
      if ('vehicleModels' in config) {
        $set['config.vehicle.models'] = config.vehicleModels;
        $unset['config.vehicleModels'] = '';
      }
      if ('engineTypes' in config) {
        $set['config.vehicle.engineTypes'] = config.engineTypes;
        $unset['config.engineTypes'] = '';
      }

      // expenseConfig mapping
      if ('subtripExpenseTypes' in config) {
        $set['config.expense.subtrip-expense-types'] = config.subtripExpenseTypes;
        $unset['config.subtripExpenseTypes'] = '';
      }
      if ('vehicleExpenseTypes' in config) {
        $set['config.expense.vehicle-expense-types'] = config.vehicleExpenseTypes;
        $unset['config.vehicleExpenseTypes'] = '';
      }

      // subtripConfig mapping
      if ('materialOptions' in config) {
        $set['config.subtrip.materialOptions'] = config.materialOptions;
        $unset['config.materialOptions'] = '';
      }

      // invoiceConfig mapping
      if ('defaultInvoiceDueInDays' in config) {
        $set['config.invoice.defaultDueInDays'] = config.defaultInvoiceDueInDays;
        $unset['config.defaultInvoiceDueInDays'] = '';
      }
      if ('defaultTaxRates' in config) {
        $set['config.invoice.defaultTaxRates'] = config.defaultTaxRates;
        $unset['config.defaultTaxRates'] = '';
      }
      if ('invoiceTermsAndConditions' in config) {
        $set['config.invoice.termsAndConditions'] = config.invoiceTermsAndConditions;
        $unset['config.invoiceTermsAndConditions'] = '';
      }

      // transporterPaymentConfig mapping
      if ('defaultTdsPercentage' in config) {
        $set['config.transporterPayment.defaultTdsPercentage'] = config.defaultTdsPercentage;
        $unset['config.defaultTdsPercentage'] = '';
      }
      if ('defaultPodCharges' in config) {
        $set['config.transporterPayment.defaultPodCharges'] = config.defaultPodCharges;
        $unset['config.defaultPodCharges'] = '';
      }
      if ('transporterPaymentTemplate' in config) {
        $set['config.transporterPayment.template'] = config.transporterPaymentTemplate;
        $unset['config.transporterPaymentTemplate'] = '';
      }

      // pumpConfig mapping
      if ('pumps' in config) {
        $set['config.pump.enabled'] = config.pumps;
        $unset['config.pumps'] = '';
      }

      console.log(`Preparing migration for Tenant: ${tenant.name} (${tenant.slug})`);
      console.log('  $set keys:', Object.keys($set));
      console.log('  $unset keys:', Object.keys($unset));

      bulkOps.push({
        updateOne: {
          filter: { _id: tenant._id },
          update: { $set, $unset }
        }
      });
    }

    if (bulkOps.length === 0) {
      console.log('\nNo updates need to be performed.');
      return;
    }

    if (dryRun) {
      console.log('\nDry run complete. No modifications were made to the database.');
    } else {
      console.log(`\nExecuting ${bulkOps.length} database updates...`);
      const result = await Tenant.bulkWrite(bulkOps);
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
