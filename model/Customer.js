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
  cellNo: { type: Number, required: true },
  consignees: [
    {
      name: { type: String, required: true },
      address: { type: String, required: true },
      state: { type: String, required: true },
      pinCode: { type: String, required: true },
    },
  ],
});

module.exports = model("Customer", CustomerSchema);
