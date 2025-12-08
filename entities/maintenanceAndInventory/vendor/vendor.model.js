import { Schema, model } from 'mongoose';

const bankDetailsSchema = new Schema(
  {
    name: { type: String, trim: true },
    branch: { type: String, trim: true },
    ifsc: { type: String, uppercase: true, trim: true },
    place: { type: String, trim: true },
    accNo: { type: String, trim: true },
  },
  { _id: false },
);

const vendorSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    address: { type: String, required: true, trim: true },
    // Optional bank details; when provided, all fields inside remain required
    bankDetails: { type: bankDetailsSchema, required: false },
    tenant: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true,
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

vendorSchema.index({ tenant: 1, name: 1 }, { unique: true });

export default model('Vendor', vendorSchema);
