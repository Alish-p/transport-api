import { Schema, model } from 'mongoose';

const dieselPriceSchema = new Schema({
  pump: { type: Schema.Types.ObjectId, ref: "Pump", required: true },
  price: { type: Number, required: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  tenant: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
});

export default model("DieselPrice", dieselPriceSchema);
