import path from 'path';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { fileURLToPath } from 'url';

import Tenant from '../entities/tenant/tenant.model.js';
import Subtrip from '../entities/subtrip/subtrip.model.js';
import Invoice from '../entities/invoice/invoice.model.js';
import Customer from '../entities/customer/customer.model.js';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

function printUsage() {
  console.log(`
======================================================================
  MIGRATE BILLING PARTY & CUSTOMER TYPE TO CONSIGNOR
======================================================================

Description:
  Updates all existing Subtrips, Customers, and Invoices for a specific
  tenant to have their billingParty / customerType set to 'consignor'.

Target Updates:
  - Subtrips:  billingParty  -> 'consignor'
  - Customers: customerType  -> 'consignor'
  - Invoices:  billingParty  -> 'consignor'

Usage:
  node scripts/migrate-billing-party-to-consignor.js <TENANT_ID_OR_NAME> [options]

Options:
  --dry-run, --dryrun    Preview documents that will be updated without modifying data (Default)
  --confirm, --execute   Execute actual updates to the database
  --help, -h             Display this help message

Examples:
  # 1. Preview changes (Dry Run):
  node scripts/migrate-billing-party-to-consignor.js 64b1f2e8a1234567890abcde --dry-run
  node scripts/migrate-billing-party-to-consignor.js "Acme Logistics" --dry-run

  # 2. Execute updates:
  node scripts/migrate-billing-party-to-consignor.js 64b1f2e8a1234567890abcde --confirm
  node scripts/migrate-billing-party-to-consignor.js "Acme Logistics" --confirm
======================================================================
`);
}

function parseArgs() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h') || args.length === 0) {
    printUsage();
    process.exit(0);
  }

  let targetIdentifier = null;
  let isConfirm = false;
  let isDryRun = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--dry-run' || arg === '--dryrun') {
      isDryRun = true;
    } else if (arg === '--confirm' || arg === '--execute' || arg === '--apply' || arg === '--write') {
      isConfirm = true;
    } else if (arg.startsWith('--tenant=') || arg.startsWith('--tenant-id=')) {
      [, targetIdentifier] = arg.split('=');
    } else if ((arg === '--tenant' || arg === '--tenant-id') && args[i + 1]) {
      targetIdentifier = args[i + 1];
      i++;
    } else if (!arg.startsWith('--') && !targetIdentifier) {
      targetIdentifier = arg;
    }
  }

  // Dry run is the default unless explicitly confirmed without --dry-run
  const dryRunMode = isDryRun || !isConfirm;

  return { dryRunMode, targetIdentifier };
}

async function run() {
  const { dryRunMode, targetIdentifier } = parseArgs();

  if (!targetIdentifier) {
    console.error('❌ Error: Tenant ID or Name is required.\n');
    printUsage();
    process.exit(1);
  }

  const { MONGO_URI, MONGODB_URI } = process.env;
  const mongoUri = MONGO_URI || MONGODB_URI;

  if (!mongoUri) {
    console.error('❌ Error: MONGO_URI is not defined in environment variables (.env).');
    process.exit(1);
  }

  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('✓ Connected to MongoDB.\n');

    // 1. Resolve Tenant
    const isObjectId = mongoose.Types.ObjectId.isValid(targetIdentifier);
    const tenantQuery = isObjectId
      ? { _id: targetIdentifier }
      : { name: new RegExp(`^${targetIdentifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') };

    const tenant = await Tenant.findOne(tenantQuery);
    if (!tenant) {
      console.error(`❌ Tenant "${targetIdentifier}" not found.`);
      const sampleTenants = await Tenant.find({}).limit(5).select('_id name');
      if (sampleTenants.length > 0) {
        console.log('\nAvailable tenants (first 5):');
        sampleTenants.forEach((t) => console.log(`  - ${t.name} (ID: ${t._id})`));
      }
      process.exit(1);
    }

    const tenantId = tenant._id;

    console.log('='.repeat(70));
    console.log(` TENANT: ${tenant.name}`);
    console.log(` TENANT ID: ${tenantId}`);
    console.log(` MODE: ${dryRunMode ? '🔍 DRY RUN (Simulation - No changes applied)' : '⚡ EXECUTE MODE (Updating Database)'}`);
    console.log('='.repeat(70));
    console.log();

    // 2. Analyze Subtrips
    console.log('--- 1. Subtrips Analysis ---');
    const totalSubtrips = await Subtrip.countDocuments({ tenant: tenantId });
    const subtripsNeedingUpdate = await Subtrip.countDocuments({
      tenant: tenantId,
      billingParty: { $ne: 'consignor' },
    });
    const subtripsAlreadyConsignor = await Subtrip.countDocuments({
      tenant: tenantId,
      billingParty: 'consignor',
    });
    const subtripsConsignee = await Subtrip.countDocuments({
      tenant: tenantId,
      billingParty: 'consignee',
    });
    const subtripsMissing = await Subtrip.countDocuments({
      tenant: tenantId,
      $or: [{ billingParty: { $exists: false } }, { billingParty: null }],
    });

    console.log(`  Total Subtrips:            ${totalSubtrips}`);
    console.log(`  - Already 'consignor':     ${subtripsAlreadyConsignor}`);
    console.log(`  - Set to 'consignee':      ${subtripsConsignee}`);
    console.log(`  - Missing / Unset:         ${subtripsMissing}`);
    console.log(`  👉 Subtrips to be updated:  ${subtripsNeedingUpdate}`);

    if (subtripsNeedingUpdate > 0) {
      const sampleSubtrips = await Subtrip.find({
        tenant: tenantId,
        billingParty: { $ne: 'consignor' },
      })
        .limit(5)
        .select('subtripNo billingParty createdAt')
        .lean();
      console.log('  Sample Subtrips to update:');
      sampleSubtrips.forEach((st) => {
        console.log(`    * No: ${st.subtripNo || 'N/A'}, ID: ${st._id}, Current billingParty in DB: ${st.billingParty !== undefined ? `"${st.billingParty}"` : 'missing/undefined'}`);
      });
    }
    console.log();

    // 3. Analyze Customers
    console.log('--- 2. Customers Analysis ---');
    const totalCustomers = await Customer.countDocuments({ tenant: tenantId });
    const customersNeedingUpdate = await Customer.countDocuments({
      tenant: tenantId,
      customerType: { $ne: 'consignor' },
    });
    const customersAlreadyConsignor = await Customer.countDocuments({
      tenant: tenantId,
      customerType: 'consignor',
    });
    const customersConsignee = await Customer.countDocuments({
      tenant: tenantId,
      customerType: 'consignee',
    });
    const customersMissing = await Customer.countDocuments({
      tenant: tenantId,
      $or: [{ customerType: { $exists: false } }, { customerType: null }],
    });

    console.log(`  Total Customers:           ${totalCustomers}`);
    console.log(`  - Already 'consignor':     ${customersAlreadyConsignor}`);
    console.log(`  - Set to 'consignee':      ${customersConsignee}`);
    console.log(`  - Missing / Unset:         ${customersMissing}`);
    console.log(`  👉 Customers to be updated: ${customersNeedingUpdate}`);

    if (customersNeedingUpdate > 0) {
      const sampleCustomers = await Customer.find({
        tenant: tenantId,
        customerType: { $ne: 'consignor' },
      })
        .limit(5)
        .select('customerName customerType')
        .lean();
      console.log('  Sample Customers to update:');
      sampleCustomers.forEach((c) => {
        console.log(`    * Name: "${c.customerName}", ID: ${c._id}, Current customerType in DB: ${c.customerType !== undefined ? `"${c.customerType}"` : 'missing/undefined'}`);
      });
    }
    console.log();

    // 4. Analyze Invoices
    console.log('--- 3. Invoices Analysis ---');
    const totalInvoices = await Invoice.countDocuments({ tenant: tenantId });
    const invoicesNeedingUpdate = await Invoice.countDocuments({
      tenant: tenantId,
      billingParty: { $ne: 'consignor' },
    });
    const invoicesAlreadyConsignor = await Invoice.countDocuments({
      tenant: tenantId,
      billingParty: 'consignor',
    });
    const invoicesConsignee = await Invoice.countDocuments({
      tenant: tenantId,
      billingParty: 'consignee',
    });
    const invoicesMissing = await Invoice.countDocuments({
      tenant: tenantId,
      $or: [{ billingParty: { $exists: false } }, { billingParty: null }],
    });

    console.log(`  Total Invoices:            ${totalInvoices}`);
    console.log(`  - Already 'consignor':     ${invoicesAlreadyConsignor}`);
    console.log(`  - Set to 'consignee':      ${invoicesConsignee}`);
    console.log(`  - Missing / Unset:         ${invoicesMissing}`);
    console.log(`  👉 Invoices to be updated:  ${invoicesNeedingUpdate}`);

    if (invoicesNeedingUpdate > 0) {
      const sampleInvoices = await Invoice.find({
        tenant: tenantId,
        billingParty: { $ne: 'consignor' },
      })
        .limit(5)
        .select('invoiceNo billingParty createdAt')
        .lean();
      console.log('  Sample Invoices to update:');
      sampleInvoices.forEach((inv) => {
        console.log(`    * Invoice No: ${inv.invoiceNo || 'N/A'}, ID: ${inv._id}, Current billingParty in DB: ${inv.billingParty !== undefined ? `"${inv.billingParty}"` : 'missing/undefined'}`);
      });
    }
    console.log();

    const totalToUpdate = subtripsNeedingUpdate + customersNeedingUpdate + invoicesNeedingUpdate;

    console.log('='.repeat(70));
    console.log(`TOTAL DOCUMENTS TO UPDATE ACROSS COLLECTIONS: ${totalToUpdate}`);
    console.log('='.repeat(70));
    console.log();

    if (totalToUpdate === 0) {
      console.log('✨ All Subtrips, Customers, and Invoices for this tenant already have consignor set.');
      console.log('No modifications required.');
      return;
    }

    // 5. Execute or Dry-Run completion
    if (dryRunMode) {
      console.log('🔍 [DRY RUN COMPLETED] No changes were written to the database.');
      console.log('To apply these changes, run the command with --confirm:');
      console.log(`\n  node scripts/migrate-billing-party-to-consignor.js "${targetIdentifier}" --confirm\n`);
    } else {
      console.log('🚀 EXECUTING DATABASE UPDATES...');

      // Update Subtrips
      const subtripResult = await Subtrip.updateMany(
        { tenant: tenantId, billingParty: { $ne: 'consignor' } },
        { $set: { billingParty: 'consignor' } }
      );
      console.log(`  ✓ Subtrips updated: ${subtripResult.modifiedCount} (Matched: ${subtripResult.matchedCount})`);

      // Update Customers
      const customerResult = await Customer.updateMany(
        { tenant: tenantId, customerType: { $ne: 'consignor' } },
        { $set: { customerType: 'consignor' } }
      );
      console.log(`  ✓ Customers updated: ${customerResult.modifiedCount} (Matched: ${customerResult.matchedCount})`);

      // Update Invoices
      const invoiceResult = await Invoice.updateMany(
        { tenant: tenantId, billingParty: { $ne: 'consignor' } },
        { $set: { billingParty: 'consignor' } }
      );
      console.log(`  ✓ Invoices updated: ${invoiceResult.modifiedCount} (Matched: ${invoiceResult.matchedCount})`);

      console.log();
      console.log('='.repeat(70));
      console.log(`🎉 MIGRATION COMPLETED SUCCESSFULLY FOR TENANT "${tenant.name}"!`);
      console.log(`  - Subtrips modified: ${subtripResult.modifiedCount}`);
      console.log(`  - Customers modified: ${customerResult.modifiedCount}`);
      console.log(`  - Invoices modified: ${invoiceResult.modifiedCount}`);
      console.log('='.repeat(70));
    }
  } catch (error) {
    console.error('\n❌ Migration failed with error:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB.');
  }
}

run();
