import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Resolve the root directory of the backend to load .env
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

// Import Models
import Expense from '../entities/expense/expense.model.js';
import Subtrip from '../entities/subtrip/subtrip.model.js';
import TransporterAdvance from '../entities/transporterAdvance/transporterAdvance.model.js';
import Vehicle from '../entities/vehicle/vehicle.model.js';

const MONGO_URI = process.env.MONGO_URI;

/**
 * Migration Script: Migrate Market Vehicle Subtrip Expenses to Transporter Advances
 * 
 * Rules:
 * 1. Find all Subtrips with market vehicles (isOwn === false).
 * 2. For each Subtrip, check if there are expenses in the `expenses` array.
 * 3. Fetch these Expenses.
 * 4. Create new TransporterAdvance documents copying the data over.
 * 5. Update the Subtrip to push to `advances` array and pull from `expenses` array.
 * 6. Delete the original Expense documents.
 */
async function migrate() {
  if (!MONGO_URI) {
    console.error('MONGO_URI is not defined in the environment variables.');
    process.exit(1);
  }

  try {
    console.log(`Connecting to MongoDB at: ${MONGO_URI}`);
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB.');

    // 1. Find all market vehicles
    const marketVehicles = await Vehicle.find({ isOwn: false }).select('_id').lean();
    const marketVehicleIds = marketVehicles.map(v => v._id);
    console.log(`Found ${marketVehicleIds.length} market vehicles.`);

    // 2. Find all subtrips using these vehicles that have expenses
    const subtripsToUpdate = await Subtrip.find({
      vehicleId: { $in: marketVehicleIds },
      'expenses.0': { $exists: true } // Has at least one expense reference
    }).lean();

    console.log(`Found ${subtripsToUpdate.length} market vehicle subtrips with expenses.`);

    if (subtripsToUpdate.length === 0) {
      console.log('No migration needed. Exiting.');
      process.exit(0);
    }

    let totalMigrated = 0;

    for (const subtrip of subtripsToUpdate) {
      const expenseIds = subtrip.expenses;
      if (!expenseIds || expenseIds.length === 0) continue;

      console.log(`Processing Subtrip ${subtrip._id} (${subtrip.subtripNo}) with ${expenseIds.length} expenses.`);

      // 3. Fetch existing expenses
      const expenses = await Expense.find({ _id: { $in: expenseIds } }).lean();
      
      if (expenses.length === 0) {
          console.log(`  - Warning: Could not find expense documents for Subtrip ${subtrip._id}.`);
          continue;
      }

      const advanceDocsToInsert = [];
      const advanceIdsToPush = [];

      // 4. Transform to TransporterAdvance
      for (const expense of expenses) {
        // Map expense fields to advance fields
        const advanceData = {
          tenant: expense.tenant,
          advanceType: expense.expenseType, // Map expenseType to advanceType
          subtripId: expense.subtripId,
          vehicleId: expense.vehicleId,
          date: expense.date,
          remarks: expense.remarks,
          amount: expense.amount,
          paidThrough: expense.paidThrough,
          pumpCd: expense.pumpCd,
          dieselLtr: expense.dieselLtr,
          dieselPrice: expense.dieselPrice,
          adblueLiters: expense.adblueLiters,
          adbluePrice: expense.adbluePrice,
          documents: expense.documents || [],
          createdBy: expense.createdBy,
        };

        const newAdvance = new TransporterAdvance(advanceData);
        advanceDocsToInsert.push(newAdvance);
        advanceIdsToPush.push(newAdvance._id);
      }

      // Insert new TransporterAdvances
      if (advanceDocsToInsert.length > 0) {
        await TransporterAdvance.insertMany(advanceDocsToInsert);
        
        // 5. Update Subtrip: Add to advances, remove from expenses
        await Subtrip.updateOne(
          { _id: subtrip._id },
          { 
            $push: { advances: { $each: advanceIdsToPush } },
            $pull: { expenses: { $in: expenseIds } }
          }
        );

        // 6. Delete the original Expenses
        const deletedResult = await Expense.deleteMany({ _id: { $in: expenseIds } });
        
        console.log(`  - Migrated ${advanceDocsToInsert.length} advances. Deleted ${deletedResult.deletedCount} old expense docs.`);
        totalMigrated += advanceDocsToInsert.length;
      }
    }

    console.log(`Migration Complete. Successfully migrated ${totalMigrated} expenses to advances.`);

  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB.');
    process.exit(0);
  }
}

migrate();
