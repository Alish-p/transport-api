import { Schema, model } from 'mongoose';
import {
  PURCHASE_ORDER_STATUS,
  PURCHASE_ORDER_DISCOUNT_TYPES,
  PURCHASE_ORDER_TAX_TYPES,
} from './purchaseOrder.constants.js';

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
    partLocation: {
      type: Schema.Types.ObjectId,
      ref: 'PartLocation',
      required: true,
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

    shipping: { type: Number, default: 0, min: 0 },

    taxType: {
      type: String,
      enum: Object.values(PURCHASE_ORDER_TAX_TYPES),
      default: PURCHASE_ORDER_TAX_TYPES.FIXED,
    },
    tax: { type: Number, default: 0, min: 0 },

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

purchaseOrderSchema.index({ tenant: 1, vendor: 1, createdAt: -1 });

export default model('PurchaseOrder', purchaseOrderSchema);

