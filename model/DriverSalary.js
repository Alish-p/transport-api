const { Schema, model } = require("mongoose");
const CounterModel = require("./Counter");

// driverSalary Schema
const driverSalarySchema = new Schema({
  _id: { type: String, immutable: true, unique: true },
  driverId: { type: String, required: true, ref: "Driver" },
  status: {
    type: String,
    required: true,
    enum: ["pending", "paid", "processing"],
  },
  createdDate: { type: Date, default: Date.now },
  periodStartDate: { type: Date },
  periodEndDate: { type: Date },
  subtripComponents: [{ type: String, ref: "Subtrip" }],
  otherSalaryComponent: [
    {
      paymentType: { type: String },
      amount: { type: Number, required: true },
      remarks: { type: String },
    },
  ],

  totalSalary: { type: Number },
});

// Pre-save middleware for creating incremental ID
driverSalarySchema.pre("save", async function (next) {
  if (!this.isNew) {
    return next();
  }
  try {
    const counter = await CounterModel.findByIdAndUpdate(
      { _id: "DriverSalaryId" },
      { $inc: { seq: 1 } },
      { upsert: true, new: true }
    );

    const Id = counter ? `DSR-${counter.seq}` : "DSR-1";
    this._id = Id;
  } catch (error) {
    return next(error);
  }
});

module.exports = model("DriverSalary", driverSalarySchema);
