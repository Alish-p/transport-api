const { Schema, model } = require("mongoose");
const CounterModel = require("./Counter");

// EmptyTrip Schema for tracking empty vehicle movements
const emptyTripSchema = new Schema({
  // Unique id for the empty trip
  _id: { type: String, immutable: true, unique: true },

  // References to related entities
  tripId: { type: String, ref: "Trip", required: true },
  routeCd: { type: Schema.Types.ObjectId, ref: "Route" },

  // Route and logistics details
  loadingPoint: { type: String },
  unloadingPoint: { type: String },
  startDate: { type: Date, required: true },
  endDate: { type: Date },
  startKm: { type: Number },
  endKm: { type: Number },

  // Status tracking
  emptyTripStatus: { type: String },

  // Basic timeline tracking
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// for creating incremental id
emptyTripSchema.pre("save", async function (next) {
  if (!this.isNew) {
    return next();
  }
  try {
    const counter = await CounterModel.findByIdAndUpdate(
      { _id: "EmptyTripId" },
      { $inc: { seq: 1 } },
      { upsert: true }
    );

    const emptyTripId = counter ? `et-${counter.seq}` : "et-1";
    this._id = emptyTripId;
  } catch (error) {
    return next(error);
  }
});

// for locking once empty trip is closed
emptyTripSchema.pre("save", function (next) {
  if (!this.isModified()) return next();

  // Allow updates only for transitioning to "closed"
  if (this.isModified("emptyTripStatus") && this.emptyTripStatus === "closed") {
    return next(); // Transition to "closed" is allowed
  }

  // If the empty trip is already closed, block further modifications
  if (this.emptyTripStatus === "closed") {
    return next(new Error("Closed empty trips cannot be modified."));
  }

  next(); // Allow other modifications
});

module.exports = model("EmptyTrip", emptyTripSchema);
