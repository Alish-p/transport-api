const { Schema, model } = require("mongoose");

// Define the customer schema
const CustomerSchema = new Schema({
  customerName: { type: String, required: true },
  GSTNo: { type: String, required: true },
  PANNo: { type: String, required: true },
  address: { type: String },
  place: { type: String },
  state: { type: String, required: true },
  pinCode: { type: String, required: true },
  cellNo: { type: String, required: true },
  consignees: [
    {
      name: { type: String, required: true },
      address: { type: String, required: true },
      state: { type: String, required: true },
      pinCode: { type: String, required: true },
    },
  ],
  bankDetails: {
    name: { type: String, required: true },
    branch: { type: String, required: true },
    ifsc: { type: String, required: true },
    place: { type: String, required: true },
    accNo: { type: String, required: true },
  },

  // code given by customer to Transport company
  transporterCode: { type: String },

  // days within which invoice should be paid
  invoiceDueInDays: { type: Number, default: 10 },
});

module.exports = model("Customer", CustomerSchema);
