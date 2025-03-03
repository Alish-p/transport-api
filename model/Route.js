const { Schema, model } = require("mongoose");

// Route Schema
const routeSchema = new Schema({
  routeName: { type: String, required: true },
  tollAmt: { type: Number, required: true },
  fromPlace: { type: String, required: true }, // mudhol
  toPlace: { type: String, required: true },
  noOfDays: { type: Number, required: true },
  salary: [
    {
      vehicleType: { type: String, required: true },
      fixedSalary: { type: Number, required: true },
      percentageSalary: { type: Number, required: true },
      fixMilage: { type: Number, required: true },
      performanceMilage: { type: Number, required: true },
      diesel: { type: Number, required: true },
      adBlue: { type: Number, required: true },
      advanceAmt: { type: Number, required: true },
    },
  ],
  ratePerTon: { type: Number, required: true },
  distance: { type: Number, required: true },
  validFromDate: { type: Date, required: true },
  validTillDate: { type: Date, required: true },
  isCustomerSpecific: { type: Boolean, default: false },
  customer: {
    type: Schema.Types.ObjectId,
    ref: "Customer",
  },
});

module.exports = model("Route", routeSchema);
