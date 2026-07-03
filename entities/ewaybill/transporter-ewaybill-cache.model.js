import { model, Schema } from 'mongoose';

const transporterEwayBillCacheSchema = new Schema(
  {
    tenant: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    generatedDate: { type: String, required: true }, // Format: DD/MM/YYYY
    ewayBills: { type: Schema.Types.Mixed, default: [] }, // Raw list returned by Whitebooks
    fetchedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

transporterEwayBillCacheSchema.index({ tenant: 1, generatedDate: 1 }, { unique: true });

export default model('TransporterEwayBillCache', transporterEwayBillCacheSchema);
