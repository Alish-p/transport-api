import { Schema, model } from 'mongoose';

// Expense Schema
const expenseSchema = new Schema({
  tripId: { type: Schema.Types.ObjectId, ref: "Trip" },
  subtripId: { type: Schema.Types.ObjectId, ref: "Subtrip" },
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
  tenant: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
});

expenseSchema.pre("validate", function (next) {
  if (this.expenseType === "Diesel") {
    this.dieselLtr = this.dieselLtr || undefined;
    this.dieselPrice = this.dieselPrice || undefined;
    this.pumpCd = this.pumpCd || undefined;
  } else {
    this.dieselLtr = undefined;
    this.dieselPrice = undefined;
    // Allow pumpCd for non-Diesel when explicitly tied to advances paid via pump
    if (this.expenseType === "Trip Advance") {
      this.pumpCd = this.pumpCd || undefined;
    } else {
      this.pumpCd = undefined;
    }
  }

  if (this.expenseType === "Driver Salary") {
    this.variableSalary = this.variableSalary || undefined;
    this.fixedSalary = this.fixedSalary || undefined;
    this.performanceSalary = this.performanceSalary || undefined;
  } else {
    this.variableSalary = undefined;
    this.fixedSalary = undefined;
    this.performanceSalary = undefined;
  }

  if (this.expenseType === "Adblue") {
    this.adblueLiters = this.adblueLiters || undefined;
    this.adbluePrice = this.adbluePrice || undefined;
  } else {
    this.adblueLiters = undefined;
    this.adbluePrice = undefined;
  }

  next();
});

export default model("Expense", expenseSchema);
