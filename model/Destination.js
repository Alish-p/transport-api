const { Schema, model } = require("mongoose");

// Mudhol

// Route Schema
const destinationSchema = new Schema({
  destinationName: { type: String, required: true },
  loadingPoints: [{ type: String }],
  unloadingPoints: [{ type: String }],
});

module.exports = model("Route", destinationSchema);
