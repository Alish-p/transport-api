import { Schema, model } from 'mongoose';

const vehicleDocumentSchema = new Schema(
  {
    vehicle: { type: Schema.Types.ObjectId, ref: 'Vehicle', required: true, index: true },
    docType: {
      type: String,
      required: true,
      enum: ['Insurance', 'PUC', 'RC', 'Fitness', 'Permit', 'Tax', 'Other'],
      index: true,
    },
    docNumber: { type: String, required: true },
    issueDate: { type: Date },
    expiryDate: { type: Date, index: true },

    // Storage fields (optional)
    storageProvider: { type: String, default: 's3' },
    fileKey: { type: String, default: null }, // S3 object key (optional)
    fileUrl: { type: String, default: null }, // optional public URL/CDN URL

    // Audit
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    isActive: { type: Boolean, default: true, index: true },
    tenant: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  },
  { timestamps: true }
);

// Ensure only one active document per vehicle + docType within a tenant
vehicleDocumentSchema.index(
  { tenant: 1, vehicle: 1, docType: 1, isActive: 1 },
  { unique: true, partialFilterExpression: { isActive: true } }
);

export default model('VehicleDocument', vehicleDocumentSchema);
