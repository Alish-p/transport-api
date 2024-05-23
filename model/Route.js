const { Schema, model } = require("mongoose");

// Route Schema
const routeSchema = new Schema({
  routeName: { type: String, required: true },
  tollAmt: { type: Number, required: true },
  advanceAmt: { type: Number, required: true },
  diesel: { type: Number, required: true },
  adBlue: { type: Number, required: true },
  fromPlace: { type: String, required: true },
  toPlace: { type: String, required: true },
  noOfDays: { type: Number, required: true },
  driverSalary: { type: Number, required: true },
  tripType: { type: String, required: true },
  fixMilage: { type: Number, required: true },
  performanceMilage: { type: Number, required: true },
  ratePerTon: { type: Number, required: true },
  salary: { type: Number, required: true },
  salaryPercentage: { type: Number, required: true },
  distance: { type: Number, required: true },
  validFromDate: { type: Date, required: true },
  transportType: { type: String, required: true },
  validTillDate: { type: Date, required: true },
});

module.exports = model("Route", routeSchema);
