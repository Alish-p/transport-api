const mongoose = require("mongoose");

const issueSchema = mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "name is required"],
    },
    description: String,
    priority: String,
    createdAt: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Issue", issueSchema);
