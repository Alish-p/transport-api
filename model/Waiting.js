const mongoose = require("mongoose");

const waitingSchema = mongoose.Schema(
  {
    duration: Number,
    student: { type: mongoose.Schema.Types.ObjectId, ref: "Student" },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Waiting", waitingSchema);
