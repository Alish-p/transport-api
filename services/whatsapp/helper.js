import Driver from '../../entities/driver/driver.model.js';
import Customer from '../../entities/customer/customer.model.js';
import Transporter from '../../entities/transporter/transporter.model.js';
import User from '../../entities/user/user.model.js';
import WhatsAppMessage from '../../entities/whatsapp/whatsappMessage.model.js';
import { formatPhoneE164ish } from '../../utils/format-utils.js';

/**
 * Resolve contact identity (Driver, Transporter, Customer, User) by phone number.
 */
export async function resolveContactEntity(phone) {
  if (!phone) {
    return { entityType: 'Unknown', entityId: null, entityName: null, tenant: null };
  }

  const last10 = String(phone).replace(/\D/g, '').slice(-10);
  if (!last10 || last10.length < 10) {
    return { entityType: 'Unknown', entityId: null, entityName: null, tenant: null };
  }

  const phoneRegex = new RegExp(`${last10}$`);

  try {
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

    // 4. Check User
    const user = await User.findOne({ mobile: phoneRegex }).select('name lastActiveTenant');
    if (user) {
      return {
        entityType: 'User',
        entityId: user._id,
        entityName: user.name,
        tenant: user.lastActiveTenant,
      };
    }
  } catch (err) {
    console.warn('Error resolving contact entity for WhatsApp phone:', phone, err?.message || err);
  }

  return { entityType: 'Unknown', entityId: null, entityName: null, tenant: null };
}

/**
 * Record an outbound WhatsApp message directly into WhatsAppMessage.
 */
export async function recordOutboundMessage({
  tenantId = null,
  messageId,
  from,
  to,
  messageType = 'template',
  content = {},
  templateName = null,
  components = null,
  rawPayload = null,
}) {
  const recipient = formatPhoneE164ish(to);
  if (!recipient || !messageId) return null;

  const now = new Date();

  // Resolve entity information if possible
  const entityResolution = await resolveContactEntity(recipient);
  const resolvedTenantId = tenantId || entityResolution.tenant || null;

  const messageContent = {
    ...content,
  };

  if (messageType === 'template') {
    if (templateName) messageContent.templateName = templateName;
    if (components) messageContent.templateComponents = components;
  }

  const messageDoc = {
    tenant: resolvedTenantId,
    messageId,
    direction: 'outbound',
    from: String(from || 'business'),
    to: recipient,
    contactPhone: recipient,
    senderName: entityResolution.entityName || null,
    messageType,
    content: messageContent,
    senderEntity: {
      entityType: entityResolution.entityType,
      entityId: entityResolution.entityId,
      entityName: entityResolution.entityName,
    },
    status: 'sent',
    statusHistory: [{ status: 'sent', timestamp: now }],
    timestamp: now,
    rawPayload,
  };

  try {
    return await WhatsAppMessage.findOneAndUpdate(
      { messageId },
      { $setOnInsert: messageDoc },
      { upsert: true, new: true }
    );
  } catch (err) {
    console.warn('Failed to record outbound WhatsApp message:', err?.message || err);
    return null;
  }
}
