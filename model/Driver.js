const { Schema, model } = require("mongoose");

const driverSchema = new Schema({
  driverName: { type: String, required: true },
  driverLicenceNo: { type: String, required: true },
  driverPresentAddress: { type: String, required: true },
  driverCellNo: { type: String, required: true },
  licenseFrom: { type: Date, required: true },
  licenseTo: { type: Date, required: true },
  aadharNo: { type: String, required: true },
  guarantorName: { type: String, required: true },
  guarantorCellNo: { type: String, required: true },
  experience: { type: Number, required: true },
  dob: { type: Date, required: true },
  permanentAddress: { type: String, required: true },
  dlImage: { type: String },
  photoImage: { type: String },
  aadharImage: { type: String },
  isActive: { type: Boolean, default: true },
  bankDetails: {
    name: { type: String, required: true },
    branch: { type: String, required: true },
    ifsc: { type: String, required: true },
    place: { type: String, required: true },
    accNo: { type: String, required: true },
  },
});

module.exports = model("Driver", driverSchema);
