const { Schema, model } = require("mongoose");

const driverSchema = new Schema({
  driverName: { type: String, required: true },
  driverLicenceNo: { type: String, required: true },
  driverPresentAddress: { type: String, required: true },
  driverCellNo: { type: String, required: true, unique: true },
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
  tenant: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
});

module.exports = model("Driver", driverSchema);
