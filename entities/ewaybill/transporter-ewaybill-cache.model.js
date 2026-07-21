import { model, Schema } from 'mongoose';

const transporterEwayBillCacheSchema = new Schema(
  {
    tenant: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    generatedDate: { type: String, required: true }, // Format: DD/MM/YYYY
    stateCode: { type: String, default: null },       // null = all-states fetch; '29' = state-filtered
    ewayBills: { type: Schema.Types.Mixed, default: [] }, // Raw list returned by Whitebooks
    fetchedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// Compound unique index covering both all-state and per-state cache entries.
transporterEwayBillCacheSchema.index(
  { tenant: 1, generatedDate: 1, stateCode: 1 },
  { unique: true }
);

const TransporterEwayBillCache = model('TransporterEwayBillCache', transporterEwayBillCacheSchema);

// Sync indexes to automatically drop legacy `tenant_1_generatedDate_1` index in MongoDB database
TransporterEwayBillCache.syncIndexes().catch((err) => {
  console.error('Failed to sync TransporterEwayBillCache indexes:', err);
});

export default TransporterEwayBillCache;
