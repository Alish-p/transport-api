import { Schema, model } from 'mongoose';

const activitySchema = new Schema({
    entity: { type: Schema.Types.ObjectId, required: true, refPath: 'entityType' },
    entityType: { type: String, required: true }, // e.g., 'PurchaseOrder'
    action: { type: String, required: true }, // CREATE, UPDATE, DELETE, APPROVED, RECEIVED, etc.
    changes: [{
        field: String,
        oldValue: Schema.Types.Mixed,
        newValue: Schema.Types.Mixed
    }],
    performedBy: {
        _id: { type: Schema.Types.ObjectId, ref: 'User' },
        name: String,
        email: String
    },
    tenant: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    timestamp: { type: Date, default: Date.now, expires: '180d' }, // 6 months retention
    metadata: Schema.Types.Mixed // For extra info like "reason"
});

// Indexes for fast lookup
activitySchema.index({ entity: 1, timestamp: -1 });
activitySchema.index({ tenant: 1, timestamp: -1 });
activitySchema.index({ 'performedBy._id': 1, timestamp: -1 });

export default model('Activity', activitySchema);
