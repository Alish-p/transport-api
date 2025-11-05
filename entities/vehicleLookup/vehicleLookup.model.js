import { Schema, model } from 'mongoose';

const vehicleLookupSchema = new Schema(
  {
    tenant: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    vehicleNo: { type: String, required: true, index: true },
    provider: { type: String, default: 'webcorevision', index: true },
    providerResponse: { type: Schema.Types.Mixed },
    normalized: {
      vehicleNo: String,
      vehicleType: String,
      modelType: String,
      vehicleCompany: String,
      noOfTyres: Number,
      chasisNo: String,
      engineNo: String,
      manufacturingYear: Number,
      loadingCapacity: Number,
      engineType: String,
      docs: [
        {
          docType: String,
          docNumber: String,
          issuer: String,
          issueDate: Date,
          expiryDate: Date,
        },
      ],
    },
  },
  { timestamps: true }
);

vehicleLookupSchema.index({ tenant: 1, vehicleNo: 1, provider: 1, createdAt: -1 });

export default model('VehicleLookup', vehicleLookupSchema);

