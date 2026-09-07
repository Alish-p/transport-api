import 'dotenv/config';
import connectDB from '../../config/db.js';
import WhatsAppMessage from '../../entities/whatsapp/whatsappMessage.model.js';
import WhatsAppConversation from '../../entities/whatsapp/whatsappConversation.model.js';
import mongoose from 'mongoose';

async function backfillConversations() {
  console.log('Connecting to database...');
  await connectDB();
  console.log('Connected.');

  console.log('Aggregating WhatsAppMessage to form conversations...');
  
  const pipeline = [
    { $sort: { timestamp: -1 } },
    {
      $group: {
        _id: { contactPhone: '$contactPhone', tenant: '$tenant' },
        lastMessage: { $first: '$$ROOT' },
        unreadCount: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $eq: ['$direction', 'inbound'] },
                  { $ne: ['$status', 'read'] },
                ],
              },
              1,
              0,
            ],
          },
        },
        totalMessages: { $sum: 1 },
        lastActivity: { $max: '$timestamp' },
      },
    },
  ];

  const results = await WhatsAppMessage.aggregate(pipeline);
  console.log(`Found ${results.length} conversation threads to migrate.`);

  let processed = 0;
  for (const group of results) {
    const { contactPhone, tenant } = group._id;
    const lastMsg = group.lastMessage;
    
    // Find last inbound message to get lastInboundAt properly if possible,
    // or just use last activity if last message was inbound.
    const lastInboundAt = lastMsg.direction === 'inbound' ? lastMsg.timestamp : null;

    const updateDoc = {
      $set: {
        lastMessage: {
          text: lastMsg.content?.text || (lastMsg.content?.media ? '[Media]' : ''),
          messageType: lastMsg.messageType || 'text',
          direction: lastMsg.direction,
          timestamp: lastMsg.timestamp,
          templateName: lastMsg.content?.templateName || null,
        },
        lastMessageAt: group.lastActivity,
        unreadCount: group.unreadCount,
        totalMessages: group.totalMessages,
        displayName: lastMsg.senderName || lastMsg.senderEntity?.entityName,
        senderEntity: lastMsg.senderEntity || { entityType: 'Unknown' },
      },
      $setOnInsert: {
        contactPhone,
        tenant: tenant || null,
      },
    };

    if (lastInboundAt) {
      updateDoc.$set.lastInboundAt = lastInboundAt;
    }

    await WhatsAppConversation.findOneAndUpdate(
      { contactPhone, tenant: tenant || null },
      updateDoc,
      { upsert: true, new: true }
    );

    processed++;
    if (processed % 100 === 0) {
      console.log(`Processed ${processed}/${results.length}...`);
    }
  }

  console.log(`Successfully backfilled ${processed} conversations.`);
  
  await mongoose.disconnect();
  console.log('Disconnected. Migration complete.');
  process.exit(0);
}

backfillConversations().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
