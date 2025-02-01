const { Schema, model } = require("mongoose");
const CounterModel = require("./Counter");

const transporterPaymentReceiptSchema = new Schema({
  _id: { type: String, immutable: true, unique: true },
  transporterId: { type: String, required: true, ref: "Transporter" },
  status: {
    type: String,
    required: true,
    enum: ["pending", "paid", "overdue"],
  },
  createdDate: { type: Date, default: Date.now },
  dueDate: { type: Date },
  associatedSubtrips: [{ type: String, ref: "Subtrip" }],
  periodStartDate: { type: Date },
  periodEndDate: { type: Date },
});

// for creating incremental id
transporterPaymentReceiptSchema.pre("save", async function (next) {
  if (!this.isNew) {
    return next();
  }
  try {
    const counter = await CounterModel.findByIdAndUpdate(
      { _id: "TransporterPaymentReceiptId" },
      { $inc: { seq: 1 } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    const receiptId = counter ? `TPR-${counter.seq}` : "TPR-1";
    this._id = receiptId;
  } catch (error) {
    return next(error);
  }
});

module.exports = model("TransporterPayment", transporterPaymentReceiptSchema);
