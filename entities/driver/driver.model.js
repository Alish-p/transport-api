import { Schema, model } from 'mongoose';
import { toTitleCase } from '../../utils/format-string.js';

const driverSchema = new Schema({
  driverName: { type: String, required: true, trim: true, set: toTitleCase },
  driverLicenceNo: { type: String, required: true },
  driverPresentAddress: { type: String, required: true },
  driverCellNo: { type: String, required: true, },
  licenseFrom: { type: Date, required: true },
  licenseTo: { type: Date, required: true },
  aadharNo: { type: String, required: true },
  guarantorName: { type: String },
  guarantorCellNo: { type: String },
  experience: { type: Number, required: true },
  dob: { type: Date },
  permanentAddress: { type: String, required: true },
  dlImage: { type: String },
  photoImage: { type: String },
  aadharImage: { type: String },
  isActive: { type: Boolean, default: true },
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
