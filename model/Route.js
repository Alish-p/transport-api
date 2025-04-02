const { Schema, model } = require("mongoose");

// Route Schema
const routeSchema = new Schema({
  routeName: { type: String, required: true },
  fromPlace: { type: String, required: true }, // mudhol
  toPlace: { type: String, required: true },
  noOfDays: { type: Number, required: true },
  vehicleConfiguration: [
    {
      vehicleType: { type: String, required: true },
      noOfTyres: { type: Number, required: true },
      tollAmt: { type: Number },
      fixedSalary: { type: Number },
      percentageSalary: { type: Number },
      fixMilage: { type: Number },
      performanceMilage: { type: Number },
      diesel: { type: Number },
      adBlue: { type: Number },
      advanceAmt: { type: Number },
    },
  ],
  distance: { type: Number, required: true },
  isCustomerSpecific: { type: Boolean, default: false },
  customer: {
    type: Schema.Types.ObjectId,
    ref: "Customer",
  },
});

module.exports = model("Route", routeSchema);
