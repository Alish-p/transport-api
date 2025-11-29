import { Schema, model } from 'mongoose';

export const INVENTORY_ACTIVITY_TYPES = {
    INITIAL: 'INITIAL',
    MANUAL_ADJUSTMENT: 'MANUAL_ADJUSTMENT',
    PURCHASE_RECEIPT: 'PURCHASE_RECEIPT',
    PURCHASE_RETURN: 'PURCHASE_RETURN',
    WORK_ORDER_ISSUE: 'WORK_ORDER_ISSUE',
    WORK_ORDER_RETURN: 'WORK_ORDER_RETURN',
    TRANSFER_OUT: 'TRANSFER_OUT',
    TRANSFER_IN: 'TRANSFER_IN',
    STOCK_TAKE_ADJUSTMENT: 'STOCK_TAKE_ADJUSTMENT',
    SYSTEM_CORRECTION: 'SYSTEM_CORRECTION',
};

export const SOURCE_DOCUMENT_TYPES = {
    PURCHASE_ORDER: 'PURCHASE_ORDER',
    WORK_ORDER: 'WORK_ORDER',
    TRANSFER: 'TRANSFER',
    MANUAL: 'MANUAL',
    SYSTEM: 'SYSTEM',
};

const inventoryActivitySchema = new Schema(
    {
        // Multi-tenant
        tenant: {
            type: Schema.Types.ObjectId,
            ref: 'Tenant',
            required: true,
            index: true,
        },

        // Core references
        part: {
            type: Schema.Types.ObjectId,
            ref: 'Part',
            required: true,
            index: true,
        },
        inventoryLocation: {
            type: Schema.Types.ObjectId,
            ref: 'PartLocation',
            required: true,
            index: true,
        },
        partInventory: {
            type: Schema.Types.ObjectId,
            ref: 'PartInventory',
            required: false,
        },

        // Activity type (business meaning)
        type: {
            type: String,
            enum: Object.values(INVENTORY_ACTIVITY_TYPES),
            required: true,
        },

        // Movement direction
        direction: {
            type: String,
            enum: ['IN', 'OUT'],
            required: true,
        },

        // Quantities
        quantityBefore: {
            type: Number,
            required: true,
            min: 0,
        },
        quantityChange: {
            type: Number,
            required: true, // can be negative
        },
        quantityAfter: {
            type: Number,
            required: true,
            min: 0,
        },

        // Who did it
        performedBy: {
            type: Schema.Types.ObjectId,
            ref: 'User', // or 'Employee' if you have that
            required: true,
        },

        // Optional explanation
        reason: {
            type: String,
            trim: true,
        },

        // Link back to business document (PO, WO, Transfer, etc.)
        sourceDocumentType: {
            type: String,
            enum: Object.values(SOURCE_DOCUMENT_TYPES),
            required: true,
        },
        sourceDocumentId: {
            type: Schema.Types.ObjectId,
            required: false,
        },
        sourceDocumentLineId: {
            type: Schema.Types.ObjectId,
            required: false,
        },

        // Free-form extra metadata (PO number, vehicle no, etc.)
        meta: {
            type: Schema.Types.Mixed,
            default: {},
        },
    },
    { timestamps: true },
);

// Common queries
inventoryActivitySchema.index({
    tenant: 1,
    part: 1,
    inventoryLocation: 1,
    createdAt: -1,
});

inventoryActivitySchema.index({
    tenant: 1,
    createdAt: -1,
});

inventoryActivitySchema.index({
    tenant: 1,
    sourceDocumentType: 1,
    sourceDocumentId: 1,
});

export default model('InventoryActivity', inventoryActivitySchema);
