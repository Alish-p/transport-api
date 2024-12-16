const { Schema, model } = require("mongoose");

// Transporter Schema
const transporterSchema = new Schema({
  transportName: { type: String, required: true },
  address: { type: String, required: true },
  place: { type: String, required: true },
  pinNo: { type: String, required: true },
  pumpPhoneNo: { type: String, required: true },
  paymentMode: { type: String, required: true },
  panNo: { type: String, required: true },
  ownerName: { type: String, required: true },
  gstNo: { type: String, required: true },
  emailId: { type: String, required: true },
  ownerPhoneNo: { type: String, required: true },
  tdsPercentage: { type: Number, required: true },
  bankDetails: {
    name: { type: String, required: true },
    branch: { type: String, required: true },
    ifsc: { type: String, required: true },
    place: { type: String, required: true },
    accNo: { type: String, required: true },
  },
});

module.exports = model("Transporter", transporterSchema);
