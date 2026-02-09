import { Schema, model } from 'mongoose';
import { toTitleCase } from '../../utils/format-string.js';

const driverSchema = new Schema({
  driverName: { type: String, required: true, trim: true, set: toTitleCase },
  driverLicenceNo: { type: String },
  driverPresentAddress: { type: String },
  driverCellNo: { type: String, required: true, },
  licenseFrom: { type: Date },
  licenseTo: { type: Date },
  aadharNo: { type: String },
  guarantorName: { type: String },
  guarantorCellNo: { type: String },
  experience: { type: Number },
  dob: { type: Date },
  permanentAddress: { type: String },
  dlImage: { type: String },
  photoImage: { type: String },
  aadharImage: { type: String },
  isActive: { type: Boolean, default: true },
  // Mark if license is past its validity
  expired: { type: Boolean, default: false },
  bankDetails: {
    name: { type: String },
    branch: { type: String },
    ifsc: { type: String },
    place: { type: String },
    accNo: { type: String },
  },
  tenant: {
    type: Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true,
  },
});

// Unique per tenant:
driverSchema.index(
  { tenant: 1, driverCellNo: 1 },
  { unique: true, name: 'uniq_driver_phone_per_tenant' }
);


export default model('Driver', driverSchema);
