const mongoose = require("mongoose");

const { Schema, model } = mongoose;

const activitySchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    action: {
      type: String,
      required: true,
    },
    message: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

// Define the Task schema
const taskSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
    },
    reporter: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    departments: {
      type: [String],
    },
    activities: {
      type: [activitySchema],
    },
    assignees: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    vehicle: {
      type: Schema.Types.ObjectId,
      ref: "Vehicle",
    },
    driver: {
      type: Schema.Types.ObjectId,
      ref: "Driver",
    },
    location: {
      type: String,
    },
    description: {
      type: String,
    },
    due: {
      type: [Date],
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high"],
      default: "low",
    },
    attachments: {
      type: [String],
    },
    status: {
      type: String,
      enum: ["todo", "in-progress", "done"],
      default: "todo",
    },
  },
  {
    timestamps: true,
  }
);

module.exports = model("Task", taskSchema);
