import { Schema, model } from 'mongoose';

const customerTargetSchema = new Schema(
    {
        tenant: {
            type: Schema.Types.ObjectId,
            ref: 'Tenant',
            required: true,
            index: true,
        },
        customer: {
            type: Schema.Types.ObjectId,
            ref: 'Customer',
            required: true,
        },
        materialTarget: {
            material: { type: String, required: true },
            targetWeight: { type: Number, required: true },
        },
        month: { type: Date, required: true }, // Format: YYYY-MM-01
        year: { type: Number, required: true },
    },
    { timestamps: true }
);

// Unique compound index to prevent duplicate targets for same customer/material/month
customerTargetSchema.index(
    { tenant: 1, customer: 1, 'materialTarget.material': 1, month: 1, year: 1 },
    { unique: true }
);

export default model('CustomerTarget', customerTargetSchema);
