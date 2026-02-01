import { Schema, model } from 'mongoose';

import {
    INVENTORY_ACTIVITY_TYPES,
    SOURCE_DOCUMENT_TYPES,
} from './partTransaction.constants.js';

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

export default model('PartTransaction', inventoryActivitySchema);
