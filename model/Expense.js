const { Schema, model } = require("mongoose");
const CounterModel = require("./Counter");

// Expense Schema
const expenseSchema = new Schema({
  _id: { type: String, immutable: true, unique: true },
  tripId: { type: String, ref: "Trip" },
  subtripId: { type: String, ref: "Subtrip" },
  vehicleId: { type: Schema.Types.ObjectId, ref: "Vehicle" },
  pumpCd: { type: Schema.Types.ObjectId, ref: "Pump", default: null },
  date: { type: Date, default: Date.now },
  expenseCategory: {
    type: String,
    enum: ["vehicle", "subtrip"],
    required: true,
  },
  expenseType: { type: String, required: true },
  amount: { type: Number, required: true },
  remarks: { type: String },
  dieselLtr: { type: Number },
  dieselPrice: { type: Number },
  paidThrough: { type: String },
  variableSalary: { type: Number },
  fixedSalary: { type: Number },
  performanceSalary: { type: Number },
  adblueLiters: { type: Number },
  adbluePrice: { type: Number },
});

expenseSchema.pre("validate", function (next) {
  if (this.expenseType === "diesel") {
    this.dieselLtr = this.dieselLtr || undefined;
    this.dieselPrice = this.dieselPrice || undefined;
    this.pumpCd = this.pumpCd || undefined;
  } else {
    this.dieselLtr = undefined;
    this.dieselPrice = undefined;
    this.pumpCd = undefined;
  }

  if (this.expenseType === "salary") {
    this.variableSalary = this.variableSalary || undefined;
    this.fixedSalary = this.fixedSalary || undefined;
    this.performanceSalary = this.performanceSalary || undefined;
  } else {
    this.variableSalary = undefined;
    this.fixedSalary = undefined;
    this.performanceSalary = undefined;
  }

  if (this.expenseType === "adblue") {
    this.adblueLiters = this.adblueLiters || undefined;
    this.adbluePrice = this.adbluePrice || undefined;
  } else {
    this.adblueLiters = undefined;
    this.adbluePrice = undefined;
  }

  next();
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
