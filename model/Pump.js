import { Schema, model } from 'mongoose';

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
  bankDetails: {
    name: { type: String, required: true },
    branch: { type: String, required: true },
    ifsc: { type: String, required: true },
    place: { type: String, required: true },
    accNo: { type: String, required: true },
  },
  tenant: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
});

export default model("Pump", pumpSchema);
