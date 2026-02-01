import { Schema, model } from 'mongoose';

const partInventorySchema = new Schema(
    {
        tenant: {
            type: Schema.Types.ObjectId,
            ref: 'Tenant',
            required: true,
            index: true,
        },

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

        quantity: {
            type: Number,
            required: true,
            min: 0,
            default: 0,
        },

        threshold: {
            type: Number,
            min: 0,
            default: 0,
        },
    },
    { timestamps: true },
);

// Ensure one row per (tenant + part + location)
partInventorySchema.index(
    { tenant: 1, part: 1, inventoryLocation: 1 },
    { unique: true },
);

// Helpful for location-based queries
partInventorySchema.index({ tenant: 1, inventoryLocation: 1 });

export default model('PartStock', partInventorySchema);
