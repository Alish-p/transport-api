import path from 'path';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { fileURLToPath } from 'url';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

// S3 Service
import { deleteObjectFromS3 } from '../services/s3.service.js';

// Core Models
import Tenant from '../entities/tenant/tenant.model.js';
import UserModel from '../entities/user/user.model.js';
import TenantMembership from '../entities/tenantMembership/tenantMembership.model.js';

// Fleet & Operations Models
import Vehicle from '../entities/vehicle/vehicle.model.js';
import VehicleDocument from '../entities/vehicleDocument/vehicleDocument.model.js';
import VehicleLookup from '../entities/vehicleLookup/vehicleLookup.model.js';
import Driver from '../entities/driver/driver.model.js';
import DriverSalary from '../entities/driverSalary/driverSalary.model.js';
import Trip from '../entities/trip/trip.model.js';
import Subtrip from '../entities/subtrip/subtrip.model.js';
import SubtripEvent from '../entities/subtripEvent/subtripEvent.model.js';
import Challan from '../entities/challan/challan.model.js';
import ChallanLookup from '../entities/challan/challanLookup.model.js';
import EwayBill from '../entities/ewaybill/ewaybill.model.js';
import TransporterEwayBillCache from '../entities/ewaybill/transporter-ewaybill-cache.model.js';
import GpsSnapshot from '../entities/gpsSnapshot/gpsSnapshot.model.js';

// Billing, Parties & Finance Models
import Customer from '../entities/customer/customer.model.js';
import CustomerTarget from '../entities/customerTarget/customerTarget.model.js';
import Transporter from '../entities/transporter/transporter.model.js';
import TransporterPayment from '../entities/transporterPayment/transporterPayment.model.js';
import TransporterAdvance from '../entities/transporterAdvance/transporterAdvance.model.js';
import Invoice from '../entities/invoice/invoice.model.js';
import Expense from '../entities/expense/expense.model.js';
import Loan from '../entities/loan/loan.model.js';

// Fuel & Tyres Models
import Pump from '../entities/pump/pump.model.js';
import FuelPrice from '../entities/pump/fuelPrice.model.js';
import Tyre from '../entities/tyre/tyre.model.js';
import TyreHistory from '../entities/tyre/tyre-history.model.js';

// Maintenance & Inventory Models
import Vendor from '../entities/maintenanceAndInventory/vendor/vendor.model.js';
import Part from '../entities/maintenanceAndInventory/part/part.model.js';
import PartStock from '../entities/maintenanceAndInventory/partStock/partStock.model.js';
import PartLocation from '../entities/maintenanceAndInventory/partLocation/partLocation.model.js';
import PartTransaction from '../entities/maintenanceAndInventory/partTransaction/partTransaction.model.js';
import PurchaseOrder from '../entities/maintenanceAndInventory/purchaseOrder/purchaseOrder.model.js';
import WorkOrder from '../entities/maintenanceAndInventory/workOrder/workOrder.model.js';

// Tasks, Activity & Counter Models
import Task from '../entities/task/task.model.js';
import Activity from '../entities/activity/activity.model.js';
import Counter from '../model/Counter.js';

const TENANT_SCOPED_MODELS = [
  { name: 'Trips', model: Trip },
  { name: 'Subtrips', model: Subtrip },
  { name: 'SubtripEvents', model: SubtripEvent },
  { name: 'Vehicles', model: Vehicle },
  { name: 'VehicleDocuments', model: VehicleDocument },
  { name: 'VehicleLookups', model: VehicleLookup },
  { name: 'Drivers', model: Driver },
  { name: 'DriverSalaries', model: DriverSalary },
  { name: 'Challans', model: Challan },
  { name: 'ChallanLookups', model: ChallanLookup },
  { name: 'EwayBills', model: EwayBill },
  { name: 'TransporterEwayBillCaches', model: TransporterEwayBillCache },
  { name: 'GpsSnapshots', model: GpsSnapshot },
  { name: 'Customers', model: Customer },
  { name: 'CustomerTargets', model: CustomerTarget },
  { name: 'Transporters', model: Transporter },
  { name: 'TransporterPayments', model: TransporterPayment },
  { name: 'TransporterAdvances', model: TransporterAdvance },
  { name: 'Invoices', model: Invoice },
  { name: 'Expenses', model: Expense },
  { name: 'Loans', model: Loan },
  { name: 'Pumps', model: Pump },
  { name: 'FuelPrices', model: FuelPrice },
  { name: 'Tyres', model: Tyre },
  { name: 'TyreHistories', model: TyreHistory },
  { name: 'Vendors', model: Vendor },
  { name: 'Parts', model: Part },
  { name: 'PartStocks', model: PartStock },
  { name: 'PartLocations', model: PartLocation },
  { name: 'PartTransactions', model: PartTransaction },
  { name: 'PurchaseOrders', model: PurchaseOrder },
  { name: 'WorkOrders', model: WorkOrder },
  { name: 'Tasks', model: Task },
  { name: 'Activities', model: Activity },
  { name: 'Counters', model: Counter },
];

function printUsage() {
  console.log(`
Usage:
  node scripts/purge-tenant.js <TENANT_ID_OR_NAME> [options]

Options:
  --dry-run, --dryrun   Preview everything that will be deleted without modifying data (Default)
  --confirm             Execute actual permanent deletion of tenant data
  --skip-s3             Skip attempting deletion of S3 files
  --help                Show this help message

Examples:
  # 1. Preview trial tenant purge safely:
  node scripts/purge-tenant.js 64b1f2e8a1234567890abcde --dry-run
  node scripts/purge-tenant.js "Acme Logistics" --dry-run

  # 2. Execute purge with confirmation:
  node scripts/purge-tenant.js "Acme Logistics" --confirm
`);
}

async function collectS3Keys(tenantId, tenantDoc) {
  const keys = new Set();

  // Tenant logo
  if (tenantDoc?.logoKey) {
    keys.add(tenantDoc.logoKey);
  }

  // Vehicle Documents file keys
  const vehicleDocs = await VehicleDocument.find({ tenant: tenantId }).select('fileKey').lean();
  for (const doc of vehicleDocs) {
    if (doc.fileKey) keys.add(doc.fileKey);
  }

  return Array.from(keys);
}

async function analyzeUsers(tenantId) {
  const memberships = await TenantMembership.find({ tenant: tenantId }).populate('user').lean();
  
  const superusers = [];
  const multiTenantUsers = [];
  const singleTenantUsers = [];

  for (const membership of memberships) {
    const user = membership.user;
    if (!user) continue;

    if (user.role === 'super') {
      superusers.push({
        _id: user._id,
        email: user.email,
        name: user.name,
        action: 'PRESERVE (Superuser - will only unlink membership)',
      });
      continue;
    }

    const otherMemberships = await TenantMembership.find({
      user: user._id,
      tenant: { $ne: tenantId },
    }).lean();

    if (otherMemberships.length > 0) {
      multiTenantUsers.push({
        _id: user._id,
        email: user.email,
        name: user.name,
        otherTenantCount: otherMemberships.length,
        action: 'PRESERVE (Has other companies - will only unlink membership & reset active tenant)',
      });
    } else {
      singleTenantUsers.push({
        _id: user._id,
        email: user.email,
        name: user.name,
        action: 'DELETE (Single-tenant trial user - account will be purged)',
      });
    }
  }

  return {
    totalMemberships: memberships.length,
    superusers,
    multiTenantUsers,
    singleTenantUsers,
  };
}

async function run() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.length === 0) {
    printUsage();
    process.exit(0);
  }

  const targetIdentifier = args.find((arg) => !arg.startsWith('--'));
  const isConfirm = args.includes('--confirm');
  const isDryRun = args.includes('--dry-run') || args.includes('--dryrun') || !isConfirm;
  const skipS3 = args.includes('--skip-s3');

  if (!targetIdentifier) {
    console.error('❌ Error: Tenant ID or Name is required.');
    printUsage();
    process.exit(1);
  }

  const { MONGO_URI } = process.env;
  if (!MONGO_URI) {
    console.error('❌ Error: MONGO_URI is not defined in environment (.env).');
    process.exit(1);
  }

  try {
    console.log(`Connecting to MongoDB...`);
    await mongoose.connect(MONGO_URI);
    console.log(`Connected successfully.\n`);

    // 1. Find Tenant
    const isObjectId = mongoose.Types.ObjectId.isValid(targetIdentifier);
    const tenantQuery = isObjectId
      ? { _id: targetIdentifier }
      : { name: new RegExp(`^${targetIdentifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') };

    const tenant = await Tenant.findOne(tenantQuery);
    if (!tenant) {
      console.error(`❌ Tenant "${targetIdentifier}" not found.`);
      process.exit(1);
    }

    const tenantId = tenant._id;

    console.log('='.repeat(70));
    console.log(` TENANT PURGE REPORT: ${tenant.name}`);
    console.log(` ID: ${tenantId}`);
    console.log(` Status: ${tenant.isActive ? 'Active' : 'Inactive'}`);
    console.log(` Plan: ${tenant.subscription?.planName || 'N/A'} (Valid till: ${tenant.subscription?.validTill ? new Date(tenant.subscription.validTill).toLocaleDateString() : 'N/A'})`);
    console.log(` Mode: ${isDryRun ? '🔍 DRY RUN (Simulation - No changes)' : '⚠️  CONFIRMED WRITE (Permanent Purge)'}`);
    console.log('='.repeat(70));
    console.log();

    // 2. Count Records across all 35 operational models
    console.log('--- 1. Operational & Master Data Scoped to Tenant ---');
    const collectionCounts = [];
    let totalDocsToDelete = 0;

    for (const { name, model } of TENANT_SCOPED_MODELS) {
      const count = await model.countDocuments({ tenant: tenantId });
      collectionCounts.push({ name, count });
      totalDocsToDelete += count;
      if (count > 0) {
        console.log(`  • ${name.padEnd(28)}: ${count} record(s)`);
      }
    }
    console.log(`\n  Total operational documents found: ${totalDocsToDelete}\n`);

    // 3. User & Membership Analysis
    console.log('--- 2. Users & Memberships Analysis ---');
    const userAnalysis = await analyzeUsers(tenantId);
    console.log(`  • Total Tenant Memberships : ${userAnalysis.totalMemberships}`);
    console.log(`  • Superusers to Preserve   : ${userAnalysis.superusers.length}`);
    for (const u of userAnalysis.superusers) {
      console.log(`      - ${u.name} <${u.email}> (${u.action})`);
    }
    console.log(`  • Multi-Tenant Users to Keep: ${userAnalysis.multiTenantUsers.length}`);
    for (const u of userAnalysis.multiTenantUsers) {
      console.log(`      - ${u.name} <${u.email}> (${u.action})`);
    }
    console.log(`  • Single-Tenant Users to Del: ${userAnalysis.singleTenantUsers.length}`);
    for (const u of userAnalysis.singleTenantUsers) {
      console.log(`      - ${u.name} <${u.email}> (${u.action})`);
    }
    console.log();

    // 4. S3 Files Analysis
    console.log('--- 3. Cloud Storage (AWS S3) Assets ---');
    const s3Keys = await collectS3Keys(tenantId, tenant);
    console.log(`  • Total explicit S3 objects to delete: ${s3Keys.length}`);
    for (const key of s3Keys) {
      console.log(`      - S3 Key: ${key}`);
    }
    console.log();

    // DRY RUN EXIT
    if (isDryRun) {
      console.log('='.repeat(70));
      console.log('✅ DRY RUN COMPLETED SAFELY');
      console.log('No data or files were deleted.');
      console.log(`To execute this deletion permanently, run:`);
      console.log(`  node scripts/purge-tenant.js ${tenantId} --confirm`);
      console.log('='.repeat(70));
      return;
    }

    // CONFIRMED PURGE EXECUTION
    console.log('='.repeat(70));
    console.log('🚀 EXECUTING PURGE IN PROGRESS...');
    console.log('='.repeat(70));

    // A. Delete S3 Objects
    if (!skipS3 && s3Keys.length > 0) {
      console.log(`Deleting ${s3Keys.length} S3 file(s)...`);
      let s3Success = 0;
      let s3Failed = 0;
      for (const key of s3Keys) {
        try {
          await deleteObjectFromS3(key);
          s3Success += 1;
        } catch (s3Err) {
          console.warn(`  ⚠️ Could not delete S3 key "${key}": ${s3Err.message}`);
          s3Failed += 1;
        }
      }
      console.log(`  S3 Deletion: ${s3Success} deleted, ${s3Failed} skipped/failed.\n`);
    }

    // B. Delete Scoped Operational Collections
    console.log('Deleting tenant-scoped collections...');
    for (const { name, model } of TENANT_SCOPED_MODELS) {
      const result = await model.deleteMany({ tenant: tenantId });
      if (result.deletedCount > 0) {
        console.log(`  ✓ ${name.padEnd(28)}: Deleted ${result.deletedCount}`);
      }
    }
    console.log();

    // C. Handle Users & Memberships
    console.log('Cleaning up users & memberships...');

    // 1. Delete single-tenant users
    for (const u of userAnalysis.singleTenantUsers) {
      await UserModel.deleteOne({ _id: u._id });
      console.log(`  ✓ Deleted user account: ${u.email}`);
    }

    // 2. Update multi-tenant and superusers if lastActiveTenant was this tenant
    for (const u of [...userAnalysis.superusers, ...userAnalysis.multiTenantUsers]) {
      const userDoc = await UserModel.findById(u._id);
      if (userDoc && String(userDoc.lastActiveTenant) === String(tenantId)) {
        const nextMembership = await TenantMembership.findOne({
          user: u._id,
          tenant: { $ne: tenantId },
          status: 'active',
        });
        userDoc.lastActiveTenant = nextMembership ? nextMembership.tenant : null;
        await userDoc.save();
        console.log(`  ✓ Reset lastActiveTenant for: ${u.email}`);
      }
    }

    // 3. Delete Tenant Memberships
    const memResult = await TenantMembership.deleteMany({ tenant: tenantId });
    console.log(`  ✓ Deleted ${memResult.deletedCount} TenantMembership record(s).`);

    // D. Delete Tenant Document
    await Tenant.findByIdAndDelete(tenantId);
    console.log(`  ✓ Deleted Tenant header: ${tenant.name} (${tenantId})\n`);

    console.log('='.repeat(70));
    console.log(`🎉 TENANT PURGE COMPLETE: "${tenant.name}" has been safely deleted.`);
    console.log('Zero impact on other tenants and active cross-tenant users.');
    console.log('='.repeat(70));

  } catch (error) {
    console.error('\n❌ An error occurred during tenant purge:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB.');
  }
}

run();
