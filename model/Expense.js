const { Schema, model } = require("mongoose");

// Expense Schema
const expenseSchema = new Schema({
  tripId: { type: Schema.Types.ObjectId, ref: "Trip", required: true },
  subtripId: { type: Schema.Types.ObjectId, ref: "Subtrip", required: true },
  vehicleId: { type: Schema.Types.ObjectId, ref: "Vehicle" },
  date: { type: Date, default: Date.now },
  expenseType: { type: String, required: true },
  installment: { type: Number, required: true },
  amount: { type: Number, required: true },
  slipNo: { type: String, required: true },
  pumpCd: { type: String },
  remarks: { type: String },
  dieselLtr: { type: Number },
  paidThrough: { type: String, required: true },
  authorisedBy: { type: String, required: true },
});

module.exports = model("Expense", expenseSchema);
