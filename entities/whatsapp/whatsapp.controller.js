import mongoose from 'mongoose';
import asyncHandler from 'express-async-handler';
import WhatsAppMessage from './whatsappMessage.model.js';
import { sendTextMessage as sendTextMessageService } from '../../services/whatsapp/api.js';
import { resolveContactEntity } from '../../services/whatsapp/helper.js';

/**
 * Format template preview text for conversation snippets.
 */
function getTemplateSnippet(templateName) {
  const map = {
    lr_generation_template: '📄 LR Details',
    driver_job_assigned: '🚚 Job Assigned',
    transporter_payment_generated_v1: '💰 Payment Receipt',
    login: '🔐 Verification Code',
  };
  return map[templateName] || `Template: ${templateName || 'Message'}`;
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
            const entityResolution = await resolveContactEntity(from);
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
 * Groups all WhatsApp messages on the fly by contact phone.
 */
const getConversations = asyncHandler(async (req, res) => {
  const { q, entityType, tenantId } = req.query;
  const { limit, skip, page } = req.pagination;

  const matchStage = {};

  if (tenantId) {
    matchStage.tenant = new mongoose.Types.ObjectId(tenantId);
  }

  if (entityType) {
    matchStage['senderEntity.entityType'] = entityType;
  }

  if (q && String(q).trim()) {
    const regex = new RegExp(String(q).trim(), 'i');
    matchStage.$or = [
      { contactPhone: regex },
      { senderName: regex },
      { 'senderEntity.entityName': regex },
    ];
  }

  const pipeline = [
    ...(Object.keys(matchStage).length > 0 ? [{ $match: matchStage }] : []),
    { $sort: { timestamp: -1 } },
    {
      $group: {
        _id: '$contactPhone',
        contactPhone: { $first: '$contactPhone' },
        lastMessageDoc: { $first: '$$ROOT' },
        lastMessageAt: { $max: '$timestamp' },
        lastInboundAt: {
          $max: {
            $cond: [{ $eq: ['$direction', 'inbound'] }, '$timestamp', null],
          },
        },
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
        senderEntity: { $first: '$senderEntity' },
        senderName: { $first: '$senderName' },
        tenant: { $first: '$tenant' },
      },
    },
    {
      $lookup: {
        from: 'tenants',
        localField: 'tenant',
        foreignField: '_id',
        as: 'tenantDoc',
      },
    },
    {
      $addFields: {
        tenant: {
          $let: {
            vars: { t: { $arrayElemAt: ['$tenantDoc', 0] } },
            in: {
              $cond: [
                { $gt: [{ $size: '$tenantDoc' }, 0] },
                {
                  _id: '$$t._id',
                  companyName: { $ifNull: ['$$t.companyName', '$$t.name'] },
                },
                null,
              ],
            },
          },
        },
        displayName: {
          $ifNull: ['$senderName', '$senderEntity.entityName', null],
        },
        lastMessage: {
          text: {
            $ifNull: [
              '$lastMessageDoc.content.text',
              {
                $cond: [
                  { $eq: ['$lastMessageDoc.messageType', 'template'] },
                  {
                    $concat: [
                      'Template: ',
                      { $ifNull: ['$lastMessageDoc.content.templateName', ''] },
                    ],
                  },
                  {
                    $cond: [
                      { $ne: ['$lastMessageDoc.content.media', null] },
                      '[Media]',
                      '',
                    ],
                  },
                ],
              },
            ],
          },
          messageType: '$lastMessageDoc.messageType',
          direction: '$lastMessageDoc.direction',
          timestamp: '$lastMessageDoc.timestamp',
          templateName: '$lastMessageDoc.content.templateName',
        },
      },
    },
    {
      $project: {
        tenantDoc: 0,
        lastMessageDoc: 0,
      },
    },
    { $sort: { lastMessageAt: -1 } },
    {
      $facet: {
        metadata: [{ $count: 'total' }],
        data: [{ $skip: skip }, { $limit: limit }],
      },
    },
  ];

  const result = await WhatsAppMessage.aggregate(pipeline);
  const total = result[0]?.metadata[0]?.total || 0;
  const rawConversations = result[0]?.data || [];

  // Enhance template snippets for lastMessage preview if available
  const conversations = rawConversations.map((c) => {
    if (c.lastMessage?.messageType === 'template') {
      const snippet = getTemplateSnippet(c.lastMessage.templateName);
      return {
        ...c,
        lastMessage: {
          ...c.lastMessage,
          text: snippet,
        },
      };
    }
    return c;
  });

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

  const contactPhone = decodeURIComponent(conversationId);

  const query = {
    contactPhone,
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

  const contactPhone = decodeURIComponent(conversationId);
  const entityResolution = await resolveContactEntity(contactPhone);

  const result = await sendTextMessageService({
    tenantId: entityResolution.tenant || null,
    to: contactPhone,
    text,
  });

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
  const contactPhone = decodeURIComponent(conversationId);

  await WhatsAppMessage.updateMany(
    {
      contactPhone,
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
