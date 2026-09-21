import { model, Schema } from 'mongoose';

// Vehicle Schema
const vehicleSchema = new Schema({
  vehicleNo: { type: String, required: true },
  vehicleType: { type: String, required: true },
  modelType: { type: String },
  vehicleCompany: { type: String },
  noOfTyres: { type: Number, required: true },
  chasisNo: { type: String },
  engineNo: { type: String },
  manufacturingYear: { type: Number },
  loadingCapacity: { type: Number },
  engineType: { type: String },
  fuelTankCapacity: { type: Number },
  trackingLink: { type: String },
  isActive: { type: Boolean, default: true },
  isOwn: { type: Boolean, default: true },
  transporter: {
    type: Schema.Types.ObjectId,
    ref: "Transporter",
    index: true,
  },
  tenant: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
  tyreLayoutId: { type: String },
  currentOdometer: { type: Number, default: 0 },
  currentOdometerUpdatedAt: { type: Date },
});

vehicleSchema.index({ vehicleNo: 1, tenant: 1 }, { unique: true });

export default model("Vehicle", vehicleSchema);
