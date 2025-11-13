import 'dotenv/config';
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';

function pad(n) {
  return n.toString().padStart(2, '0');
}

function timestamp() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  const ss = pad(d.getSeconds());
  return `${yyyy}${mm}${dd}_${hh}${mi}${ss}`;
}

async function ensureDir(dir) {
  await fs.promises.mkdir(dir, { recursive: true });
}

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('MONGO_URI not set in environment (.env).');
    process.exit(1);
  }

  try {
    await mongoose.connect(uri, { maxPoolSize: 5 });
  } catch (err) {
    console.error('Failed to connect to MongoDB:', err.message);
    process.exit(1);
  }

  const db = mongoose.connection.db;
  const dbName = db.databaseName || 'database';

  const backupsRoot = path.resolve(process.cwd(), 'backups');
  const stamp = timestamp();
  const destDir = path.join(backupsRoot, `${dbName}-backup-${stamp}`);

  await ensureDir(destDir);

  // Write a small manifest for reference
  const manifest = {
    database: dbName,
    createdAt: new Date().toISOString(),
    uriMasked: uri.replace(/:(?:[^:@/]+)@/, ':****@'),
    tool: 'scripts/backup-db.js',
    format: 'per-collection JSON array',
  };
  await fs.promises.writeFile(
    path.join(destDir, 'backup-meta.json'),
    JSON.stringify(manifest, null, 2),
    'utf8',
  );

  console.log(`Backing up database "${dbName}" to: ${destDir}`);

  let collections;
  try {
    collections = await db.listCollections().toArray();
  } catch (err) {
    console.error('Failed to list collections:', err.message);
    await mongoose.disconnect();
    process.exit(1);
  }

  for (const { name } of collections) {
    const coll = db.collection(name);
    const outPath = path.join(destDir, `${name}.json`);
    process.stdout.write(` - ${name} ... `);
    try {
      const docs = await coll.find({}).toArray();
      await fs.promises.writeFile(outPath, JSON.stringify(docs, null, 2), 'utf8');
      console.log(`ok (${docs.length} docs)`);
    } catch (err) {
      console.log('failed');
      console.error(`   Error backing up collection ${name}:`, err.message);
    }
  }

  await mongoose.disconnect();
  console.log('Backup complete.');
  console.log(`Location: ${destDir}`);
}

main().catch((err) => {
  console.error('Unexpected error during backup:', err);
  process.exit(1);
});

