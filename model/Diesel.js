const { Schema, model } = require("mongoose");

const dieselPriceSchema = new Schema({
  pump: { type: Schema.Types.ObjectId, ref: "Pump", required: true },
  price: { type: Number, required: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
});

module.exports = model("DieselPrice", dieselPriceSchema);
