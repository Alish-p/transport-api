const { Schema, model } = require("mongoose");

// Define the customer schema
const CustomerSchema = new Schema({
  customerName: { type: String, required: true },
  GSTNo: { type: String },
  gstEnabled: { type: Boolean, required: true },
  PANNo: { type: String },
  address: { type: String, required: true },

  state: { type: String, required: true },
  pinCode: { type: String },
  cellNo: { type: String },
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

  invoicePrefix: { type: String, required: true },
  invoiceSuffix: { type: String },
  currentInvoiceSerialNumber: { type: Number, required: true },

  // days within which invoice should be paid
  invoiceDueInDays: { type: Number, default: 10 },
  tenant: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
});

module.exports = model("Customer", CustomerSchema);
