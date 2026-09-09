import 'dotenv/config';
import mongoose from 'mongoose';
import connectDB from '../../config/db.js';

/**
 * Note: Conversations are now dynamically aggregated on-the-fly from the single
 * `WhatsAppMessage` collection. A separate `WhatsAppConversation` collection is no longer used.
 *
 * This script is retained for cleaning up any legacy `whatsappconversations` collection.
 */
async function cleanupLegacyConversations() {
  console.log('Connecting to database...');
  await connectDB();
  console.log('Connected.');

  try {
    const collections = await mongoose.connection.db.listCollections({ name: 'whatsappconversations' }).toArray();
    if (collections.length > 0) {
      console.log('Dropping legacy whatsappconversations collection...');
      await mongoose.connection.db.dropCollection('whatsappconversations');
      console.log('Legacy collection dropped successfully.');
    } else {
      console.log('No legacy whatsappconversations collection found.');
    }
  } catch (err) {
    console.warn('Notice:', err?.message || err);
  }

  await mongoose.disconnect();
  console.log('Disconnected. Done.');
  process.exit(0);
}

cleanupLegacyConversations().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
