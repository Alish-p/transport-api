import { Schema, model } from 'mongoose';

const optionSchema = new Schema(
    {
        tenant: {
            type: Schema.Types.ObjectId,
            ref: 'Tenant',
            required: true,
            index: true,
        },
        group: {
            type: String,
            required: true,
            index: true, // e.g., 'vehicleType', 'fuelType', 'partCategory'
        },
        label: {
            type: String,
            required: true,
            trim: true,
        },
        value: {
            type: String,
            required: true,
            trim: true,
        },
        isFixed: {
            type: Boolean,
            default: false, // If true, this option cannot be deleted or edited by the user
        },
        isActive: {
            type: Boolean,
            default: true,
        },
    },
    { timestamps: true }
);

// Ensure unique values within a group for a specific tenant
optionSchema.index({ tenant: 1, group: 1, value: 1 }, { unique: true });

export default model('Option', optionSchema);
