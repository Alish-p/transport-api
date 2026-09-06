import { Schema, model } from 'mongoose';

const mediaSchema = new Schema(
  {
    id: { type: String },
    mimeType: { type: String },
    caption: { type: String },
    filename: { type: String },
    sha256: { type: String },
    url: { type: String },
  },
  { _id: false }
);

const locationSchema = new Schema(
  {
    latitude: { type: Number },
    longitude: { type: Number },
    name: { type: String },
    address: { type: String },
  },
  { _id: false }
);

const interactiveSchema = new Schema(
  {
    type: { type: String },
    title: { type: String },
    id: { type: String },
    description: { type: String },
  },
  { _id: false }
);

const whatsappMessageSchema = new Schema(
  {
    tenant: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      index: true,
    },
    messageId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    direction: {
      type: String,
      enum: ['inbound', 'outbound'],
      required: true,
      index: true,
    },
    from: {
      type: String,
      required: true,
      index: true,
    },
    to: {
      type: String,
      required: true,
      index: true,
    },
    // The counterparty phone number (for grouping conversation threads)
    contactPhone: {
      type: String,
      required: true,
      index: true,
    },
    senderName: {
      type: String,
    },
    messageType: {
      type: String,
      enum: [
        'text',
        'image',
        'document',
        'audio',
        'voice',
        'video',
        'location',
        'contacts',
        'interactive',
        'button',
        'template',
        'unknown',
      ],
      default: 'text',
    },
    content: {
      text: { type: String },
      media: mediaSchema,
      location: locationSchema,
      button: {
        text: { type: String },
        payload: { type: String },
      },
      interactive: interactiveSchema,
      templateName: { type: String },
      templateComponents: { type: Schema.Types.Mixed },
    },
    senderEntity: {
      entityType: {
        type: String,
        enum: ['Driver', 'Transporter', 'Customer', 'User', 'Unknown'],
        default: 'Unknown',
      },
      entityId: {
        type: Schema.Types.ObjectId,
        default: null,
      },
      entityName: {
        type: String,
        default: null,
      },
    },
    status: {
      type: String,
      enum: ['sent', 'delivered', 'read', 'failed', 'received'],
      default: 'received',
      index: true,
    },
    statusHistory: [
      {
        status: { type: String },
        timestamp: { type: Date },
        errorDetails: [Schema.Types.Mixed],
      },
    ],
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
    rawPayload: {
      type: Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
  }
);

// Helpful compound indexes
whatsappMessageSchema.index({ tenant: 1, contactPhone: 1, timestamp: -1 });
whatsappMessageSchema.index({ tenant: 1, timestamp: -1 });
whatsappMessageSchema.index({ tenant: 1, status: 1 });

export default model('WhatsAppMessage', whatsappMessageSchema);
