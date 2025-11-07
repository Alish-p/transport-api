import { Schema, model } from "mongoose";

const bankDetailsSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    branch: { type: String, required: true, trim: true },
    ifsc: { type: String, required: true, uppercase: true, trim: true },
    place: { type: String, required: true },
    accNo: { type: String, required: true, trim: true },
  },
  { _id: false }
);

const pumpSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    ownerName: { type: String, required: true, trim: true },
    address: { type: String, required: true, trim: true },
    bankDetails: { type: bankDetailsSchema, required: true },
    tenant: {
      type: Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },
  },
  { timestamps: true }
);

pumpSchema.index({ tenant: 1, name: 1 }, { unique: true });

export default model("Pump", pumpSchema);
