const { default: mongoose } = require("mongoose");
const { Schema, model } = require("mongoose");
const { addDays } = require("../Utils/dateUtil");
const CounterModel = require("./Counter");

const halfRegistration = new Schema({
  _id: { type: String, immutable: true, unique: true },
  student: { type: mongoose.Schema.Types.ObjectId, ref: "Student" },
  startDate: { type: Date, default: Date.now },
  endDate: Date,
  fees: Number,
  duration: Number,
  shift: {
    type: String,
    required: true,
    enum: ["morning", "evening", "afternoon"],
  },
});

// for creating incremental id
halfRegistration.pre("save", async function (next) {
  try {
    const counter = await CounterModel.findByIdAndUpdate(
      { _id: "HalfRID" },
      { $inc: { seq: 1 } },
      { upsert: true }
    );

    const HalfRID = counter ? `HRI-${counter.seq}` : "HRI-1";
    this._id = HalfRID;

    const start = new Date(this.startDate.getTime());
    this.endDate = addDays(start, this.duration);
  } catch (error) {
    return next(error);
  }
});

module.exports = model("HRegistrations", halfRegistration);
