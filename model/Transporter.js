const { Schema, model } = require("mongoose");

// Transporter Schema
const transporterSchema = new Schema({
  transportName: { type: String, required: true },
  address: { type: String },
  place: { type: String },
  pinNo: { type: String },
  cellNo: { type: String },
  paymentMode: { type: String },
  panNo: { type: String },
  ownerName: { type: String },
  gstNo: { type: String },
  emailId: { type: String },
  ownerPhoneNo: { type: String },
  tdsPercentage: { type: Number },
  bankDetails: {
    name: { type: String },
    branch: { type: String },
    ifsc: { type: String },
    place: { type: String },
    accNo: { type: String },
  },
});

module.exports = model("Transporter", transporterSchema);
