import { Schema, model } from 'mongoose';
import { toTitleCase } from '../../utils/format-string.js';

// Define the customer schema
const CustomerSchema = new Schema({
  customerName: { type: String, required: true, trim: true, set: toTitleCase },
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
    name: { type: String },
    branch: { type: String },
    ifsc: { type: String },
    place: { type: String },
    accNo: { type: String },
  },

  // code given by customer to Transport company
  transporterCode: { type: String },

  invoicePrefix: { type: String, required: true },
  invoiceSuffix: { type: String },
  currentInvoiceSerialNumber: { type: Number, required: true },

  // days within which invoice should be paid
  invoiceDueInDays: { type: Number, default: 10 },
  tenant: {
    type: Schema.Types.ObjectId,
    ref: "Tenant",
    required: true,
    index: true,
  },
});

export default model("Customer", CustomerSchema);
