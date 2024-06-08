const { Schema, model } = require("mongoose");

// subtrip Schema
const subtripSchema = new Schema({
  routeCd: { type: Schema.Types.ObjectId, ref: "Route", required: true },
  customerId: { type: String, required: true },
  loadingPoint: { type: String, required: true },
  unloadingPoint: { type: String, required: true },
  loadingWeight: { type: Number },
  unloadingWeight: { type: Number },
  startDate: { type: Date, required: true },
  endDate: { type: Date },
  startKm: { type: Number },
  endKm: { type: Number },
  rate: { type: Number },
  subtripStatus: { type: String },
  invoiceNo: { type: String },
  shipmentNo: { type: String },
  orderNo: { type: String },
  ewayBill: { type: String },
  ewayExpiryDate: { type: Date },
  materialType: { type: String },
  quantity: { type: Number },
  grade: { type: String },
  detentionTime: { type: Number },
  tds: { type: Number },
  deductedWeight: { type: Number },
  tripId: { type: Schema.Types.ObjectId, ref: "Trip", required: true },
  expenses: [{ type: Schema.Types.ObjectId, ref: "Expense" }],
});

module.exports = model("Subtrip", subtripSchema);
