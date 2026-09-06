import asyncHandler from 'express-async-handler';

import Driver from '../driver/driver.model.js';
import Tenant from '../tenant/tenant.model.js';
import Customer from '../customer/customer.model.js';
import WhatsAppMessage from './whatsappMessage.model.js';
import Transporter from '../transporter/transporter.model.js';

/**
 * Resolve sender identity (Driver, Transporter, Customer) by phone number.
 */
async function resolveSenderEntity(phone, tenantId = null) {
  if (!phone) return { entityType: 'Unknown', entityId: null, entityName: null };
  const last10 = String(phone).replace(/\D/g, '').slice(-10);
  if (!last10 || last10.length < 10) {
    return { entityType: 'Unknown', entityId: null, entityName: null };
  }

  const phoneRegex = new RegExp(`${last10}$`);

  // 1. Check Driver
  const driverQuery = { driverCellNo: phoneRegex };
  if (tenantId) driverQuery.tenant = tenantId;
  const driver = await Driver.findOne(driverQuery).select('driverName tenant');
  if (driver) {
    return {
      entityType: 'Driver',
      entityId: driver._id,
      entityName: driver.driverName,
      tenant: driver.tenant,
    };
  }

  // 2. Check Transporter
  const transporterQuery = { cellNo: phoneRegex };
  if (tenantId) transporterQuery.tenant = tenantId;
  const transporter = await Transporter.findOne(transporterQuery).select(
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
  const customerQuery = { cellNo: phoneRegex };
  if (tenantId) customerQuery.tenant = tenantId;
  const customer = await Customer.findOne(customerQuery).select(
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

  return { entityType: 'Unknown', entityId: null, entityName: null };
}

/**
 * Resolve tenant from Meta's phone_number_id.
 */
async function resolveTenantFromPhoneNumberId(phoneNumberId) {
  if (!phoneNumberId) return null;

  try {
    const tenant = await Tenant.findOne({
      'integrations.whatsapp.config.phoneNumberId': phoneNumberId,
      'integrations.whatsapp.enabled': true,
    }).select('_id');
    if (tenant) return tenant._id;

    const fallbackTenant = await Tenant.findOne({
      'integrations.whatsapp.config.phoneNumberId': phoneNumberId,
    }).select('_id');
    if (fallbackTenant) return fallbackTenant._id;
  } catch (err) {
    console.error('Error resolving tenant from phoneNumberId:', err?.message || err);
  }

  return null;
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
        let resolvedTenantId = await resolveTenantFromPhoneNumberId(phoneNumberId);

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

            // Resolve sender identity & tenant
            const entityResolution = await resolveSenderEntity(from, resolvedTenantId);
            if (!resolvedTenantId && entityResolution.tenant) {
              resolvedTenantId = entityResolution.tenant;
            }

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
              tenant: resolvedTenantId || null,
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
 * GET /api/whatsapp/messages
 * View message history (supports filters by phone, direction, sender entity, date).
 */
const getMessages = asyncHandler(async (req, res) => {
  const { phone, direction, entityType, search, startDate, endDate } = req.query;
  const { limit, skip, page } = req.pagination;

  const query = {};
  if (req.tenant) {
    query.tenant = req.tenant;
  }

  if (phone) {
    const digits = String(phone).replace(/\D/g, '').slice(-10);
    query.contactPhone = new RegExp(`${digits}$`);
  }

  if (direction && ['inbound', 'outbound'].includes(direction)) {
    query.direction = direction;
  }

  if (
    entityType &&
    ['Driver', 'Transporter', 'Customer', 'User', 'Unknown'].includes(entityType)
  ) {
    query['senderEntity.entityType'] = entityType;
  }

  if (search && String(search).trim()) {
    const regex = new RegExp(String(search).trim(), 'i');
    query.$or = [
      { 'content.text': regex },
      { senderName: regex },
      { 'senderEntity.entityName': regex },
      { contactPhone: regex },
    ];
  }

  if (startDate || endDate) {
    query.timestamp = {};
    if (startDate) query.timestamp.$gte = new Date(startDate);
    if (endDate) query.timestamp.$lte = new Date(endDate);
  }

  const [total, messages] = await Promise.all([
    WhatsAppMessage.countDocuments(query),
    WhatsAppMessage.find(query)
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
  ]);

  return res.status(200).json({
    success: true,
    data: messages,
    pagination: {
      total,
      page,
      limit,
      pages: Math.ceil(total / limit) || 1,
    },
  });
});

/**
 * GET /api/whatsapp/conversations
 * View aggregated conversation threads grouped by contact phone.
 */
const getConversations = asyncHandler(async (req, res) => {
  const { search, entityType } = req.query;
  const { limit, skip, page } = req.pagination;

  const matchStage = {};
  if (req.tenant) {
    matchStage.tenant = req.tenant;
  }

  const pipeline = [
    { $match: matchStage },
    { $sort: { timestamp: -1 } },
    {
      $group: {
        _id: '$contactPhone',
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
    { $sort: { lastActivity: -1 } },
  ];

  if (entityType) {
    pipeline.push({
      $match: { 'lastMessage.senderEntity.entityType': entityType },
    });
  }

  if (search && String(search).trim()) {
    const regex = new RegExp(String(search).trim(), 'i');
    pipeline.push({
      $match: {
        $or: [
          { _id: regex },
          { 'lastMessage.senderName': regex },
          { 'lastMessage.senderEntity.entityName': regex },
          { 'lastMessage.content.text': regex },
        ],
      },
    });
  }

  // Count total conversations
  const countPipeline = [...pipeline, { $count: 'total' }];
  const [countResult] = await WhatsAppMessage.aggregate(countPipeline);
  const total = countResult?.total || 0;

  pipeline.push({ $skip: skip }, { $limit: limit });

  const conversations = await WhatsAppMessage.aggregate(pipeline);

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
 * PATCH /api/whatsapp/conversations/:phone/read
 * Mark inbound messages in a conversation as read.
 */
const markConversationAsRead = asyncHandler(async (req, res) => {
  const { phone } = req.params;
  if (!phone) {
    return res.status(400).json({ message: 'Phone parameter is required' });
  }

  const digits = String(phone).replace(/\D/g, '').slice(-10);
  const query = {
    contactPhone: new RegExp(`${digits}$`),
    direction: 'inbound',
    status: { $ne: 'read' },
  };
  if (req.tenant) {
    query.tenant = req.tenant;
  }

  const result = await WhatsAppMessage.updateMany(query, {
    $set: { status: 'read' },
    $push: {
      statusHistory: {
        status: 'read',
        timestamp: new Date(),
      },
    },
  });

  return res.status(200).json({
    success: true,
    updatedCount: result.modifiedCount,
  });
});

export {
  verifyWebhook,
  receiveWebhook,
  getMessages,
  getConversations,
  markConversationAsRead,
};
