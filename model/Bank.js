const { Schema, model } = require("mongoose");

// Bank Master Schema
const bankSchema = new Schema({
  name: { type: String, required: true },
  branch: { type: String, required: true },
  ifsc: { type: String, required: true, unique: true },
  place: { type: String, required: true },
});

module.exports = model("Bank", bankSchema);
