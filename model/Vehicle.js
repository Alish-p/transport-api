const { Schema, model } = require("mongoose");

// Vehicle Schema
const vehicleSchema = new Schema({
  vehicleNo: { type: String, required: true },
  vehicleType: { type: String, required: true },
  modelType: { type: String, required: true },
  vehicleCompany: { type: String, required: true },
  noOfTyres: { type: Number, required: true },
  chasisNo: { type: String, required: true },
  engineNo: { type: String, required: true },
  manufacturingYear: { type: Number, required: true },
  loadingCapacity: { type: Number, required: true },
  engineType: { type: String, required: true },
  fuelTankCapacity: { type: Number, required: true },
  isActive: { type: Boolean, default: true },
  isOwn: { type: Boolean, default: true },
  transporter: {
    type: Schema.Types.ObjectId,
    ref: "Transporter",
  },
});

module.exports = model("Vehicle", vehicleSchema);
