const { Schema, model } = require("mongoose");

// Route Schema
const routeSchema = new Schema({
  routeName: { type: String, required: true },
  fromPlace: { type: String, required: true }, // mudhol
  toPlace: { type: String, required: true },
  noOfDays: { type: Number, required: true },
  vehicleConfiguration: [
    {
      vehicleType: { type: String, required: true },
      noOfTyres: { type: Number, required: true },
      tollAmt: { type: Number },
      fixedSalary: { type: Number },
      percentageSalary: { type: Number },
      fixMilage: { type: Number },
      performanceMilage: { type: Number },
      diesel: { type: Number },
      adBlue: { type: Number },
      advanceAmt: { type: Number },
    },
  ],
  distance: { type: Number, required: true },
  isCustomerSpecific: { type: Boolean, default: false },
  customer: {
    type: Schema.Types.ObjectId,
    ref: "Customer",
  },
  tenant: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
});

// Custom validator to check for unique vehicle configurations
routeSchema.pre("save", function (next) {
  const vehicleConfigs = this.vehicleConfiguration;
  const uniqueConfigs = new Set();

  for (const config of vehicleConfigs) {
    // Create a unique key based on vehicleType and noOfTyres
    const configKey = `${config.vehicleType}-${config.noOfTyres}`;

    if (uniqueConfigs.has(configKey)) {
      next(
        new Error(
          "Duplicate vehicle configuration found. Each vehicle type and number of tyres combination must be unique."
        )
      );
      return;
    }

    uniqueConfigs.add(configKey);
  }

  next();
});

// Add the same validation for findOneAndUpdate operations
routeSchema.pre("findOneAndUpdate", function (next) {
  const update = this.getUpdate();
  if (update.vehicleConfiguration) {
    const vehicleConfigs = update.vehicleConfiguration;
    const uniqueConfigs = new Set();

    for (const config of vehicleConfigs) {
      const configKey = `${config.vehicleType}-${config.noOfTyres}`;

      if (uniqueConfigs.has(configKey)) {
        next(
          new Error(
            "Duplicate vehicle configuration found. Each vehicle type and number of tyres combination must be unique."
          )
        );
        return;
      }

      uniqueConfigs.add(configKey);
    }
  }
  next();
});

module.exports = model("Route", routeSchema);
