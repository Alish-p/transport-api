/**
 * Migration Script: Backfill TenantMembership from User records
 *
 * Usage:
 *   Dry-run mode for palasaraalis@gmail.com (default, does NOT write to database):
 *     node scripts/migrations/migrate-user-tenant-memberships.js --dry-run
 *
 *   Execute mode for palasaraalis@gmail.com:
 *     node scripts/migrations/migrate-user-tenant-memberships.js --execute
 *
 *   Target specific user email:
 *     node scripts/migrations/migrate-user-tenant-memberships.js --email=user@example.com [--dry-run|--execute]
 *
 *   Migrate ALL users (when ready later):
 *     node scripts/migrations/migrate-user-tenant-memberships.js --all [--dry-run|--execute]
 */

import path from 'path';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { fileURLToPath } from 'url';

import UserModel from '../../entities/user/user.model.js';
import TenantMembership from '../../entities/tenantMembership/tenantMembership.model.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from transport-api root
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const isExecuteMode = process.argv.includes('--execute');
const isDryRun = !isExecuteMode || process.argv.includes('--dry-run');

// By default target palasaraalis@gmail.com only, unless --all or a custom --email is passed
const emailArg = process.argv.find((arg) => arg.startsWith('--email='));
const isAll = process.argv.includes('--all');

let targetEmail = 'palasaraalis@gmail.com';
if (emailArg) {
  targetEmail = emailArg.split('=')[1].trim().toLowerCase();
} else if (isAll) {
  targetEmail = null;
}

const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/tranzit';

async function runMigration() {
  console.log('====================================================');
  console.log('  MIGRATE USER -> TENANT MEMBERSHIPS');
  console.log(`  Scope:  ${targetEmail ? `Single user (${targetEmail})` : 'All users (--all)'}`);
  console.log(`  Mode:   ${isDryRun ? '🔍 DRY RUN (NO CHANGES WILL BE WRITTEN)' : '⚡ EXECUTE MODE (WRITING CHANGES)'}`);
  console.log('====================================================\n');

  try {
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB successfully.\n');

    // Fetch target user(s)
    const filter = targetEmail ? { email: targetEmail } : {};
    const usersToMigrate = await UserModel.find(filter).lean();

    if (usersToMigrate.length === 0) {
      console.log(`⚠️  No user found matching filter: ${JSON.stringify(filter)}\n`);
      return;
    }

    console.log(`Found ${usersToMigrate.length} user record(s) matching criteria.\n`);

    const stats = {
      totalScanned: usersToMigrate.length,
      skippedNoTenant: 0,
      alreadyMigrated: 0,
      membershipsToCreate: 0,
      lastActiveTenantToSet: 0,
      errors: 0,
    };

    for (const user of usersToMigrate) {
      if (!user.tenant) {
        console.log(`[SKIP] User "${user.name}" (${user.email || user.mobile}) has no assigned tenant.`);
        stats.skippedNoTenant += 1;
        continue;
      }

      // Check if membership already exists
      const existingMembership = await TenantMembership.findOne({
        user: user._id,
        tenant: user.tenant,
      }).lean();

      if (existingMembership) {
        console.log(`[EXISTS] User "${user.name}" (${user.email}) already has membership in tenant: ${user.tenant}`);
        stats.alreadyMigrated += 1;
      } else {
        stats.membershipsToCreate += 1;
        console.log(
          `[${isDryRun ? 'WOULD CREATE' : 'CREATING'}] Membership for User "${user.name}" (${user.email || user.mobile}) -> Tenant: ${user.tenant} | Role: ${user.role || 'user'}`
        );

        if (!isDryRun) {
          try {
            await TenantMembership.create({
              user: user._id,
              tenant: user.tenant,
              role: user.role === 'super' ? 'admin' : (user.role || 'user'),
              designation: user.designation || '',
              permissions: user.permissions || {},
              status: 'active',
              isDefault: true,
            });
            console.log(`  ✅ Successfully created TenantMembership for user ${user._id}`);
          } catch (err) {
            console.error(`  ❌ Error creating membership for user ${user._id}:`, err.message);
            stats.errors += 1;
          }
        }
      }

      // Check if lastActiveTenant needs to be set
      if (!user.lastActiveTenant) {
        stats.lastActiveTenantToSet += 1;
        console.log(`  ↳ [${isDryRun ? 'WOULD SET' : 'SETTING'}] lastActiveTenant for User "${user.name}" -> ${user.tenant}`);

        if (!isDryRun) {
          try {
            await UserModel.updateOne(
              { _id: user._id },
              { $set: { lastActiveTenant: user.tenant } }
            );
            console.log(`  ✅ Set lastActiveTenant on User doc`);
          } catch (err) {
            console.error(`  ❌ Error setting lastActiveTenant for user ${user._id}:`, err.message);
            stats.errors += 1;
          }
        }
      }
    }

    if (!isDryRun) {
      // Ensure indexes
      console.log('\nEnsuring unique index on TenantMembership ({ user: 1, tenant: 1 })...');
      await TenantMembership.init();
      console.log('Indexes confirmed.');
    }

    console.log('\n====================================================');
    console.log('  MIGRATION SUMMARY');
    console.log('====================================================');
    console.log(`Target Scope:                  ${targetEmail || 'All users'}`);
    console.log(`Total Users Scanned:           ${stats.totalScanned}`);
    console.log(`Users Skipped (No Tenant):     ${stats.skippedNoTenant}`);
    console.log(`Memberships Already Existing:  ${stats.alreadyMigrated}`);
    console.log(`Memberships ${isDryRun ? 'To Create' : 'Created'}:        ${stats.membershipsToCreate}`);
    console.log(`Users ${isDryRun ? 'To Update' : 'Updated'} (lastActive):   ${stats.lastActiveTenantToSet}`);
    console.log(`Errors Encountered:            ${stats.errors}`);
    console.log('====================================================\n');

    if (isDryRun) {
      console.log('✅ DRY RUN COMPLETE. No data was modified.');
      console.log('To execute this migration for this user against the database, run:');
      console.log('  node scripts/migrations/migrate-user-tenant-memberships.js --execute\n');
      console.log('To migrate ALL users later, run:');
      console.log('  node scripts/migrations/migrate-user-tenant-memberships.js --all --execute\n');
    } else {
      console.log('✅ MIGRATION EXECUTION COMPLETE.\n');
    }
  } catch (error) {
    console.error('Fatal migration error:', error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB.');
  }
}

runMigration();
