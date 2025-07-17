const { Schema, model } = require("mongoose");

// Expense Schema
const expenseSchema = new Schema({
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
  tenant: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
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

module.exports = model("Expense", expenseSchema);
