const { Schema, model } = require("mongoose");

// Pump Schema
const pumpSchema = new Schema({
  pumpName: { type: String, required: true },
  placeName: { type: String, required: true },
  ownerName: { type: String, required: true },
  ownerCellNo: { type: String, required: true },
  pumpPhoneNo: { type: String, required: true },
  taluk: { type: String, required: true },
  district: { type: String, required: true },
  contactPerson: { type: String, required: true },
  address: { type: String, required: true },
  bankDetails: { type: Schema.Types.ObjectId, ref: "Bank" },
});

module.exports = model("Pump", pumpSchema);
