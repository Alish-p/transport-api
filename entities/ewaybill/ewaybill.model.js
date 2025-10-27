import { Schema, model } from 'mongoose';

// Flexible E-Way Bill storage
const ewayBillSchema = new Schema(
  {
    ewayBillNo: { type: String, required: true },
    gstin: { type: String },
    source: { type: String, default: 'MastersIndia' },
    status: { type: String, default: 'SUCCESS' },
    payload: { type: Schema.Types.Mixed },
    meta: { type: Schema.Types.Mixed },
    fetchedAt: { type: Date, default: Date.now },
    tenant: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  },
  { timestamps: true },
);

ewayBillSchema.index({ tenant: 1, ewayBillNo: 1 }, { unique: true });

export default model('EwayBill', ewayBillSchema);

