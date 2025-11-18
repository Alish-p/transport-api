import { Schema, model } from "mongoose";
import { FUEL_TYPES } from "./pump.constants.js";

const fuelPriceSchema = new Schema(
  {
    pump: {
      type: Schema.Types.ObjectId,
      ref: "Pump",
      required: true,
      index: true,
    },
    fuelType: {
      type: String,
      enum: FUEL_TYPES,
      required: true,
      index: true,
    },
    price: { type: Number, required: true },
    fromDate: { type: Date, required: true },
    toDate: { type: Date, required: true },
    tenant: {
      type: Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },
  },
  { timestamps: true }
);

fuelPriceSchema.index(
  { tenant: 1, pump: 1, fuelType: 1, fromDate: 1, toDate: 1 },
  { name: "tenant_pump_fuelType_date_range" }
);

export default model("FuelPrice", fuelPriceSchema);
