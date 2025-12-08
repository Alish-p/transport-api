import { Schema, model } from 'mongoose';
import {
  PURCHASE_ORDER_STATUS,
  PURCHASE_ORDER_DISCOUNT_TYPES,
  PURCHASE_ORDER_TAX_TYPES,
} from './purchaseOrder.constants.js';
import activityLoggerPlugin from '../../../utils/plugins/activity-logger.plugin.js';

const purchaseOrderLineSchema = new Schema(
  {
    part: {
      type: Schema.Types.ObjectId,
      ref: 'Part',
      required: true,
    },
    quantityOrdered: { type: Number, required: true, min: 0 },
    quantityReceived: { type: Number, default: 0, min: 0 },
    unitCost: { type: Number, required: true, min: 0 },
    amount: { type: Number, required: true, min: 0 },
    partSnapshot: {
      partNumber: String,
      name: String,
      measurementUnit: String,
      manufacturer: String,
      category: String,
    },
  },
  { _id: true },
);

const purchaseOrderSchema = new Schema(
  {
    vendor: {
      type: Schema.Types.ObjectId,
      ref: 'Vendor',
      required: true,
    },
    vendorSnapshot: {
      name: String,
      phone: String,
      address: String,
      bankDetails: {
        name: String,
        branch: String,
        ifsc: String,
        place: String,
        accNo: String,
      },
    },
    partLocation: {
      type: Schema.Types.ObjectId,
      ref: 'PartLocation',
      required: true,
    },
    partLocationSnapshot: {
      name: String,
      address: String,
    },
    status: {
      type: String,
      enum: Object.values(PURCHASE_ORDER_STATUS),
      default: PURCHASE_ORDER_STATUS.PENDING_APPROVAL,
      index: true,
    },
    lines: {
      type: [purchaseOrderLineSchema],
      validate: {
        validator(value) {
          return Array.isArray(value) && value.length > 0;
        },
        message: 'At least one line item is required',
      },
    },
    description: { type: String, trim: true },

    subtotal: { type: Number, required: true, min: 0 },
    discountType: {
      type: String,
      enum: Object.values(PURCHASE_ORDER_DISCOUNT_TYPES),
      default: PURCHASE_ORDER_DISCOUNT_TYPES.FIXED,
    },
    discount: { type: Number, default: 0, min: 0 },
    // Effective discount amount after applying type
    discountAmount: { type: Number, default: 0, min: 0 },

    shipping: { type: Number, default: 0, min: 0 },

    taxType: {
      type: String,
      enum: Object.values(PURCHASE_ORDER_TAX_TYPES),
      default: PURCHASE_ORDER_TAX_TYPES.FIXED,
    },
    tax: { type: Number, default: 0, min: 0 },
    // Effective tax amount after applying type
    taxAmount: { type: Number, default: 0, min: 0 },

    total: { type: Number, required: true, min: 0 },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    purchasedBy: { type: Schema.Types.ObjectId, ref: 'User' },

    approvedAt: { type: Date },
    purchasedAt: { type: Date },
    receivedAt: { type: Date },

    rejectionReason: { type: String },
    paymentReference: { type: String },

    tenant: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true,
    },
  },
  { timestamps: true },
);

purchaseOrderSchema.plugin(activityLoggerPlugin);

purchaseOrderSchema.index({ tenant: 1, vendor: 1, createdAt: -1 });

purchaseOrderSchema.pre('findOneAndDelete', async function (next) {
  const doc = await this.model.findOne(this.getQuery());
  const restrictedStatuses = [
    PURCHASE_ORDER_STATUS.PURCHASED,
    PURCHASE_ORDER_STATUS.PARTIAL_RECEIVED,
    PURCHASE_ORDER_STATUS.RECEIVED,
  ];
  if (doc && restrictedStatuses.includes(doc.status)) {
    return next(
      new Error(
        'Cannot delete a purchase order that is purchased, partially received, or received.',
      ),
    );
  }
  next();
});

export default model('PurchaseOrder', purchaseOrderSchema);
