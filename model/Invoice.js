const { Schema, model } = require("mongoose");
const CounterModel = require("./Counter");

// invoice Schema
const invoiceSchema = new Schema({
  _id: { type: String, immutable: true, unique: true },
  customerId: { type: String, required: true, ref: "Customer" },

  invoiceStatus: {
    type: String,
    required: true,
    enum: ["pending", "paid", "overdue"],
  },
  createdDate: { type: Date, default: Date.now },
  dueDate: { type: Date },
  periodStartDate: { type: Date },
  periodEndDate: { type: Date },
  invoicedSubTrips: [{ type: String, ref: "Subtrip" }],
});

// for creating incremental id
invoiceSchema.pre("save", async function (next) {
  if (!this.isNew) {
    return next();
  }
  try {
    const counter = await CounterModel.findByIdAndUpdate(
      { _id: "InvoiceId" },
      { $inc: { seq: 1 } },
      { upsert: true }
    );

    const invoiceId = counter ? `INV-${counter.seq}` : "INV-1";
    this._id = invoiceId;
  } catch (error) {
    return next(error);
  }
});

module.exports = model("Invoice", invoiceSchema);
