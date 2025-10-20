import { Schema, model } from 'mongoose';
import { DOC_TYPES } from './vehicleDocument.constants.js';

const vehicleDocumentSchema = new Schema(
  {
    vehicle: { type: Schema.Types.ObjectId, ref: 'Vehicle', required: true, index: true },
    docType: {
      type: String,
      required: true,
      enum: [...DOC_TYPES],
    },
    docNumber: { type: String, required: true },
    issuer: { type: String, trim: true },
    issueDate: { type: Date },
    expiryDate: { type: Date, },

    // Storage fields (optional)
    storageProvider: { type: String, default: 's3' },
    fileKey: { type: String, default: null }, // S3 object key (optional)
    fileUrl: { type: String, default: null }, // optional public URL/CDN URL

    // Audit
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    isActive: { type: Boolean, default: true, },
    tenant: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, },
  },
  { timestamps: true }
);

// Ensure only one active document per vehicle + docType within a tenant
vehicleDocumentSchema.index(
  { tenant: 1, vehicle: 1, docType: 1, isActive: 1 },
  { unique: true, partialFilterExpression: { isActive: true } }
);

export default model('VehicleDocument', vehicleDocumentSchema);
