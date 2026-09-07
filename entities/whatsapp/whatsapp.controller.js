import asyncHandler from 'express-async-handler';
import Driver from '../driver/driver.model.js';
import Customer from '../customer/customer.model.js';
import WhatsAppMessage from './whatsappMessage.model.js';
import WhatsAppConversation from './whatsappConversation.model.js';
import Transporter from '../transporter/transporter.model.js';
import { sendTextMessage as sendTextMessageService } from '../../services/whatsapp/api.js';

/**
 * Resolve sender identity (Driver, Transporter, Customer) by phone number.
 */
async function resolveSenderEntity(phone) {
  if (!phone) return { entityType: 'Unknown', entityId: null, entityName: null, tenant: null };
  const last10 = String(phone).replace(/\D/g, '').slice(-10);
  if (!last10 || last10.length < 10) {
    return { entityType: 'Unknown', entityId: null, entityName: null, tenant: null };
  }

  const phoneRegex = new RegExp(`${last10}$`);

  // 1. Check Driver
  const driver = await Driver.findOne({ driverCellNo: phoneRegex }).select('driverName tenant');
  if (driver) {
    return {
      entityType: 'Driver',
      entityId: driver._id,
      entityName: driver.driverName,
      tenant: driver.tenant,
    };
  }

  // 2. Check Transporter
  const transporter = await Transporter.findOne({ cellNo: phoneRegex }).select(
    'transportName ownerName tenant'
  );
  if (transporter) {
    return {
      entityType: 'Transporter',
      entityId: transporter._id,
      entityName: transporter.transportName || transporter.ownerName,
      tenant: transporter.tenant,
    };
  }

  // 3. Check Customer
  const customer = await Customer.findOne({ cellNo: phoneRegex }).select(
    'customerName companyName tenant'
  );
  if (customer) {
    return {
      entityType: 'Customer',
      entityId: customer._id,
      entityName: customer.customerName || customer.companyName,
      tenant: customer.tenant,
    };
  }

  return { entityType: 'Unknown', entityId: null, entityName: null, tenant: null };
}

/**
 * GET /api/whatsapp/webhook
 * Meta Webhook verification handshake.
 */
const verifyWebhook = (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const expectedToken = process.env.WA_VERIFY_TOKEN;

  if (mode && token) {
    if (mode === 'subscribe' && (!expectedToken || token === expectedToken)) {
      console.log('WhatsApp webhook verified successfully');
      return res.status(200).send(challenge);
    }
    console.warn('WhatsApp webhook verification failed: token mismatch');
    return res.status(403).json({ message: 'Forbidden: verification token mismatch' });
  }

  return res.status(400).json({ message: 'Missing hub.mode or hub.verify_token' });
};

/**
 * POST /api/whatsapp/webhook
 * Meta Webhook event payload receiver.
 */
const receiveWebhook = async (req, res) => {
  // Acknowledge receipt to Meta immediately (Meta requires fast 200 OK)
  res.sendStatus(200);

  try {
    const body = req.body;
    if (!body || body.object !== 'whatsapp_business_account') {
      return;
    }

    const entries = Array.isArray(body.entry) ? body.entry : [];
    for (const entry of entries) {
      const changes = Array.isArray(entry.changes) ? entry.changes : [];
      for (const change of changes) {
        if (change.field !== 'messages') continue;
        const value = change.value;
        if (!value) continue;

        const phoneNumberId = value.metadata?.phone_number_id;
        const displayPhoneNumber = value.metadata?.display_phone_number;

        // 1. Process Status Updates (sent, delivered, read, failed)
        if (Array.isArray(value.statuses)) {
          for (const st of value.statuses) {
            const msgId = st.id;
            const newStatus = st.status;
            const statusDate = st.timestamp
              ? new Date(Number(st.timestamp) * 1000)
              : new Date();

            await WhatsAppMessage.findOneAndUpdate(
              { messageId: msgId },
              {
                $set: { status: newStatus },
                $push: {
                  statusHistory: {
                    status: newStatus,
                    timestamp: statusDate,
                    errorDetails: st.errors || [],
                  },
                },
              }
            );
          }
        }

        // 2. Process Inbound Messages
        if (Array.isArray(value.messages)) {
          const contacts = Array.isArray(value.contacts) ? value.contacts : [];

          for (const msg of value.messages) {
            const from = msg.from;
            const msgId = msg.id;
            const msgType = msg.type || 'text';
            const msgTimestamp = msg.timestamp
              ? new Date(Number(msg.timestamp) * 1000)
              : new Date();

            const contact = contacts.find((c) => c.wa_id === from);
            const senderName = contact?.profile?.name || null;

            // Resolve sender identity across registered entities
            const entityResolution = await resolveSenderEntity(from);
            const resolvedTenantId = entityResolution.tenant || null;

            const content = {
              text: msg.text?.body || null,
            };

            if (msgType === 'image' && msg.image) {
              content.media = {
                id: msg.image.id,
                mimeType: msg.image.mime_type,
                sha256: msg.image.sha256,
                caption: msg.image.caption,
              };
            } else if (msgType === 'document' && msg.document) {
              content.media = {
                id: msg.document.id,
                mimeType: msg.document.mime_type,
                filename: msg.document.filename,
                caption: msg.document.caption,
                sha256: msg.document.sha256,
              };
            } else if (
              (msgType === 'audio' || msgType === 'voice') &&
              (msg.audio || msg.voice)
            ) {
              const mediaObj = msg.audio || msg.voice;
              content.media = {
                id: mediaObj.id,
                mimeType: mediaObj.mime_type,
              };
            } else if (msgType === 'video' && msg.video) {
              content.media = {
                id: msg.video.id,
                mimeType: msg.video.mime_type,
                caption: msg.video.caption,
              };
            } else if (msgType === 'location' && msg.location) {
              content.location = {
                latitude: msg.location.latitude,
                longitude: msg.location.longitude,
                name: msg.location.name,
                address: msg.location.address,
              };
            } else if (msgType === 'button' && msg.button) {
              content.button = {
                text: msg.button.text,
                payload: msg.button.payload,
              };
            } else if (msgType === 'interactive' && msg.interactive) {
              const itype = msg.interactive.type;
              content.interactive = {
                type: itype,
                title:
                  msg.interactive.button_reply?.title ||
                  msg.interactive.list_reply?.title,
                id:
                  msg.interactive.button_reply?.id ||
                  msg.interactive.list_reply?.id,
                description: msg.interactive.list_reply?.description,
              };
              content.text = content.interactive.title || null;
            }

            const messageDoc = {
              tenant: resolvedTenantId,
              messageId: msgId,
              direction: 'inbound',
              from,
              to: displayPhoneNumber || phoneNumberId || 'business',
              contactPhone: from,
              senderName,
              messageType: msgType,
              content,
              senderEntity: {
                entityType: entityResolution.entityType,
                entityId: entityResolution.entityId,
                entityName: entityResolution.entityName,
              },
              status: 'received',
              timestamp: msgTimestamp,
              rawPayload: msg,
            };

            await WhatsAppMessage.findOneAndUpdate(
              { messageId: msgId },
              { $setOnInsert: messageDoc },
              { upsert: true, new: true }
            );

            // Upsert WhatsAppConversation globally by contact phone
            const updateDoc = {
              $inc: { unreadCount: 1, totalMessages: 1 },
              $set: {
                lastMessage: {
                  text: content.text || '[Media]',
                  messageType: msgType,
                  direction: 'inbound',
                  timestamp: msgTimestamp,
                  templateName: null,
                },
                lastMessageAt: msgTimestamp,
                lastInboundAt: msgTimestamp,
                displayName: senderName || entityResolution.entityName,
                tenant: resolvedTenantId,
                senderEntity: {
                  entityType: entityResolution.entityType,
                  entityId: entityResolution.entityId,
                  entityName: entityResolution.entityName,
                },
              },
              $setOnInsert: { contactPhone: from },
            };

            await WhatsAppConversation.findOneAndUpdate(
              { contactPhone: from },
              updateDoc,
              { upsert: true, new: true }
            );
          }
        }
      }
    }
  } catch (err) {
    console.error('Error processing WhatsApp webhook:', err?.message || err);
  }
};

/**
 * GET /api/whatsapp/conversations
 */
const getConversations = asyncHandler(async (req, res) => {
  const { q, entityType, tenantId } = req.query;
  const { limit, skip, page } = req.pagination;

  const query = {};

  if (tenantId) {
    query.tenant = tenantId;
  }

  if (entityType) {
    query['senderEntity.entityType'] = entityType;
  }

  if (q && String(q).trim()) {
    const regex = new RegExp(String(q).trim(), 'i');
    query.$or = [
      { contactPhone: regex },
      { displayName: regex },
      { 'senderEntity.entityName': regex },
    ];
  }

  const [total, conversations] = await Promise.all([
    WhatsAppConversation.countDocuments(query),
    WhatsAppConversation.find(query)
      .populate('tenant', 'companyName')
      .sort({ lastMessageAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
  ]);

  return res.status(200).json({
    success: true,
    data: conversations,
    pagination: {
      total,
      page,
      limit,
      pages: Math.ceil(total / limit) || 1,
    },
  });
});

/**
 * GET /api/whatsapp/conversations/:conversationId/messages
 */
const getConversationMessages = asyncHandler(async (req, res) => {
  const { conversationId } = req.params;
  const { before } = req.query;
  const limit = parseInt(req.query.limit, 10) || 50;

  const conversation = await WhatsAppConversation.findById(conversationId);
  if (!conversation) {
    return res.status(404).json({ message: 'Conversation not found' });
  }

  const query = {
    contactPhone: conversation.contactPhone,
  };

  if (before) {
    query.timestamp = { $lt: new Date(before) };
  }

  const messages = await WhatsAppMessage.find(query)
    .sort({ timestamp: -1 })
    .limit(limit)
    .lean();

  return res.status(200).json({
    success: true,
    data: messages.reverse(),
  });
});

/**
 * POST /api/whatsapp/messages/send
 */
const sendTextMessage = asyncHandler(async (req, res) => {
  const { conversationId, text } = req.body;

  if (!conversationId || !text) {
    return res.status(400).json({ message: 'conversationId and text are required' });
  }

  const conversation = await WhatsAppConversation.findById(conversationId);
  if (!conversation) {
    return res.status(404).json({ message: 'Conversation not found' });
  }

  const result = await sendTextMessageService({
    tenantId: conversation.tenant,
    to: conversation.contactPhone,
    text,
  });

  if (result.ok) {
    const now = new Date();
    await WhatsAppConversation.findByIdAndUpdate(conversationId, {
      $inc: { totalMessages: 1 },
      $set: {
        lastMessage: {
          text,
          messageType: 'text',
          direction: 'outbound',
          timestamp: now,
          templateName: null,
        },
        lastMessageAt: now,
      },
    });
  }

  return res.status(result.ok ? 200 : 400).json(result);
});

/**
 * GET /api/whatsapp/media/:mediaId
 */
const getMediaProxy = asyncHandler(async (req, res) => {
  const { mediaId } = req.params;
  if (!mediaId) {
    return res.status(400).json({ message: 'mediaId is required' });
  }

  const message = await WhatsAppMessage.findOne({ 'content.media.id': mediaId });
  if (!message) {
    return res.status(404).json({ message: 'Media not found' });
  }

  const accessToken = process.env.WA_ACCESS_TOKEN;
  if (!accessToken) {
    return res.status(400).json({ message: 'WhatsApp configuration incomplete: missing access token' });
  }

  try {
    const metaRes = await globalThis.fetch(`https://graph.facebook.com/v22.0/${mediaId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!metaRes.ok) {
      const errData = await metaRes.text();
      console.error('Failed to get media url from meta', { status: metaRes.status, data: errData });
      return res.status(metaRes.status).json({ message: 'Failed to fetch media details from Meta' });
    }

    const metaData = await metaRes.json();
    const mediaUrl = metaData.url;
    if (!mediaUrl) {
      return res.status(404).json({ message: 'Media URL not found in Meta response' });
    }

    const binaryRes = await globalThis.fetch(mediaUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'User-Agent': 'Tranzit-API/1.0',
      },
    });

    if (!binaryRes.ok) {
      console.error('Failed to download media binary', { status: binaryRes.status });
      return res.status(binaryRes.status).json({ message: 'Failed to download media' });
    }

    const buffer = await binaryRes.arrayBuffer();

    res.set('Content-Type', binaryRes.headers.get('Content-Type') || 'application/octet-stream');
    res.set('Cross-Origin-Resource-Policy', 'cross-origin');
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Cache-Control', 'public, max-age=86400, immutable');

    return res.send(Buffer.from(buffer));
  } catch (error) {
    console.error('Error in getMediaProxy:', error?.message || error);
    return res.status(500).json({ message: 'Internal server error fetching media' });
  }
});

/**
 * PATCH /api/whatsapp/conversations/:conversationId/read
 */
const markConversationAsRead = asyncHandler(async (req, res) => {
  const { conversationId } = req.params;

  const conversation = await WhatsAppConversation.findById(conversationId);
  if (!conversation) {
    return res.status(404).json({ message: 'Conversation not found' });
  }

  conversation.unreadCount = 0;
  await conversation.save();

  await WhatsAppMessage.updateMany(
    {
      contactPhone: conversation.contactPhone,
      direction: 'inbound',
      status: { $ne: 'read' },
    },
    {
      $set: { status: 'read' },
      $push: {
        statusHistory: {
          status: 'read',
          timestamp: new Date(),
        },
      },
    }
  );

  return res.status(200).json({ success: true });
});

export {
  verifyWebhook,
  receiveWebhook,
  getConversations,
  getConversationMessages,
  sendTextMessage,
  markConversationAsRead,
  getMediaProxy,
};
