const { Schema, model } = require("mongoose");

// Bank Master Schema
const bankSchema = new Schema({
  bankCd: { type: String, required: true },
  bankBranch: { type: String, required: true },
  ifscCode: { type: String, required: true },
  place: { type: String, required: true },
});

module.exports = model("Bank", bankSchema);
