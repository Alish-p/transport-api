import { Schema, model } from 'mongoose';

const challanLookupSchema = new Schema(
  {
    tenant: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    vehicle: { type: Schema.Types.ObjectId, ref: 'Vehicle', required: true, index: true },
    vehicleNo: { type: String, required: true, index: true },
    provider: { type: String, default: 'webcorevision', index: true },
    providerResponse: { type: Schema.Types.Mixed },
    summary: {
      pendingCount: { type: Number },
      disposedCount: { type: Number },
    },
  },
  { timestamps: true }
);

challanLookupSchema.index({ tenant: 1, vehicleNo: 1, createdAt: -1 });

export default model('ChallanLookup', challanLookupSchema);

