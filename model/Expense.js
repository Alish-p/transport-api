const { Schema, model } = require("mongoose");
const CounterModel = require("./Counter");

// Expense Schema
const expenseSchema = new Schema({
  _id: { type: String, immutable: true, unique: true },
  tripId: { type: String, ref: "Trip" },
  subtripId: { type: String, ref: "Subtrip" },
  vehicleId: { type: Schema.Types.ObjectId, ref: "Vehicle" },
  date: { type: Date, default: Date.now },
  expenseCategory: {
    type: String,
    enum: ["vehicle", "subtrip"],
    required: true,
  },
  expenseType: { type: String, required: true },

  amount: { type: Number, required: true },
  slipNo: { type: String },
  pumpCd: { type: Schema.Types.ObjectId, ref: "Pump", default: null },
  remarks: { type: String },
  fuelLtr: { type: Number },
  fuelRate: { type: Number },
  paidThrough: { type: String },
  authorisedBy: { type: String },
});

// for creating incremental id
expenseSchema.pre("save", async function (next) {
  if (!this.isNew) {
    return next();
  }
  try {
    const counter = await CounterModel.findByIdAndUpdate(
      { _id: "ExpenseId" },
      { $inc: { seq: 1 } },
      { upsert: true }
    );

    const expenseId = counter ? `e-${counter.seq}` : "e-1";
    this._id = expenseId;
  } catch (error) {
    return next(error);
  }
});

module.exports = model("Expense", expenseSchema);
