// Copy collections from source to target MongoDB
// Usage: node scripts/copyCollections.js <tenantId>

const { MongoClient } = require('mongodb');

const SOURCE_URI = process.env.SOURCE_URI;
const TARGET_URI = process.env.TARGET_URI;
const TENANT_ID = process.argv[2];

if (!SOURCE_URI || !TARGET_URI) {
  console.error('SOURCE_URI and TARGET_URI environment variables are required');
  process.exit(1);
}

if (!TENANT_ID) {
  console.error('Tenant id argument is required');
  process.exit(1);
}

async function copy() {
  const sourceClient = new MongoClient(SOURCE_URI);
  const targetClient = new MongoClient(TARGET_URI);

  try {
    await sourceClient.connect();
    await targetClient.connect();

    const sourceDb = sourceClient.db();
    const targetDb = targetClient.db();

    const collections = await sourceDb.listCollections().toArray();

    for (const { name } of collections) {
      const sourceColl = sourceDb.collection(name);
      const targetColl = targetDb.collection(name);

      const cursor = sourceColl.find();
      const docs = [];
      await cursor.forEach((doc) => {
        docs.push({ ...doc, tenantId: TENANT_ID });
      });

      if (docs.length) {
        await targetColl.insertMany(docs);
      }
      console.log(`Copied ${docs.length} documents to ${name}`);
    }
  } finally {
    await sourceClient.close();
    await targetClient.close();
  }
}

copy().catch((err) => {
  console.error(err);
  process.exit(1);
});

