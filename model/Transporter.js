const { Schema, model } = require("mongoose");

// Transporter Schema
const transporterSchema = new Schema({
  transportName: { type: String, required: true },
  address: { type: String, required: true },
  place: { type: String },
  state: { type: String, required: true },
  pinNo: { type: String, required: true },
  cellNo: { type: String, required: true },
  paymentMode: { type: String, required: true },
  panNo: { type: String },
  ownerName: { type: String, required: true },
  gstEnabled: { type: Boolean, required: true },
  gstNo: { type: String },
  emailId: { type: String, required: true },
  ownerPhoneNo: { type: String, required: true },
  tdsPercentage: { type: Number, required: true },
  podCharges: { type: Number, required: true },
  bankDetails: {
    name: { type: String, required: true },
    branch: { type: String, required: true },
    ifsc: { type: String, required: true },
    place: { type: String, required: true },
    accNo: { type: String, required: true },
  },
});

module.exports = model("Transporter", transporterSchema);
