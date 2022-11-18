const mongoose = require("mongoose");

const waitingSchema = mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "name is required"],
    },
    duration: Number,
    mobileNumber: Number,
    gender: String,
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Waiting", waitingSchema);
