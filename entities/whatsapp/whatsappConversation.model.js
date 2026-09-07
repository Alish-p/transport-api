import mongoose from 'mongoose';

const whatsappConversationSchema = new mongoose.Schema(
  {
    tenant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      index: true,
    },
    contactPhone: {
      type: String,
      required: true,
      index: true,
    },
    displayName: {
      type: String,
    },
    senderEntity: {
      entityType: {
        type: String,
        enum: ['Driver', 'Transporter', 'Customer', 'User', 'Unknown'],
        default: 'Unknown',
      },
      entityId: {
        type: mongoose.Schema.Types.ObjectId,
      },
      entityName: {
        type: String,
      },
    },
    lastMessage: {
      text: String,
      messageType: String,
      direction: String,
      timestamp: Date,
      templateName: String,
    },
    lastMessageAt: {
      type: Date,
      index: true,
    },
    lastInboundAt: {
      type: Date,
    },
    unreadCount: {
      type: Number,
      default: 0,
    },
    totalMessages: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

whatsappConversationSchema.index({ contactPhone: 1 }, { unique: true });
whatsappConversationSchema.index({ lastMessageAt: -1 });
whatsappConversationSchema.index({ tenant: 1, lastMessageAt: -1 });

const WhatsAppConversation = mongoose.model('WhatsAppConversation', whatsappConversationSchema);

export default WhatsAppConversation;
