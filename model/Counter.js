const { Schema, model } = require("mongoose");

const CounterSchema = Schema({
  model: { type: String, required: true },
  seq: { type: Number, default: 0 },
  tenant: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
});

CounterSchema.index({ model: 1, tenant: 1 }, { unique: true });

module.exports = model("counter", CounterSchema);
