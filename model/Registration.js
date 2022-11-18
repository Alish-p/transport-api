const { default: mongoose } = require("mongoose");
const { Schema, model } = require("mongoose");
const { addDays } = require("../Utils/dateUtil");
const CounterModel = require("./Counter");

const registrationSchema = new Schema({
  _id: { type: String, immutable: true, unique: true },
  student: { type: mongoose.Schema.Types.ObjectId, ref: "Student" },
  seatNumber: Number,
  startDate: { type: Date, default: Date.now },
  endDate: Date,
  renewDate: { type: Date, default: null },
  renewFees: Number,
  fees: Number,
  duration: Number,
});

// for creating incremental id
registrationSchema.pre("save", async function (next) {
  try {
    const counter = await CounterModel.findByIdAndUpdate(
      { _id: "RegistrationId" },
      { $inc: { seq: 1 } },
      { upsert: true }
    );

    const registrationId = counter ? `RI-${counter.seq}` : "RI-1";
    this._id = registrationId;

    const start = new Date(this.startDate.getTime());
    this.endDate = addDays(start, this.duration);
  } catch (error) {
    return next(error);
  }
});

module.exports = model("Registrations", registrationSchema);
