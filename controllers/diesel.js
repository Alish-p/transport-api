const asyncHandler = require("express-async-handler");
const Pump = require("../model/Pump");
const DieselPrice = require("../model/Diesel");

const createDieselPrice = asyncHandler(async (req, res) => {
  const { pump, price, startDate, endDate } = req.body;

  const existingPump = await Pump.findById(pump);
  if (!existingPump) {
    return res.status(400).json({ message: "Pump not found" });
  }

  // Check if there is any overlapping diesel price entry for this pump
  const overlappingDieselPrice = await DieselPrice.findOne({
    pump,
    $or: [{ startDate: { $lte: endDate }, endDate: { $gte: startDate } }],
  });

  if (overlappingDieselPrice) {
    return res.status(400).json({
      message: "A diesel price entry already exists in the given date range.",
    });
  }

  // Save new diesel price entry
  const dieselPrice = new DieselPrice({
    pump,
    price,
    startDate,
    endDate,
  });

  const newDieselPrice = await dieselPrice.save();
  res.status(201).json(newDieselPrice);
});

// Fetch Diesel Prices (can be filtered)
const fetchDieselPrices = asyncHandler(async (req, res) => {
  const dieselPrices = await DieselPrice.find().populate("pump");
  res.status(200).json(dieselPrices);
});

// Fetch Diesel Price on a particular day for any pump
const fetchDieselPriceOnDate = asyncHandler(async (req, res) => {
  const { pump, date } = req.params;

  if (!pump || !date) {
    return res.status(400).json({ message: "Pump and date are required." });
  }

  // Convert date string to actual Date object
  const queryDate = new Date(date);

  // Query: Find diesel price where the given date falls between startDate and endDate
  const dieselPrices = await DieselPrice.find({
    pump,
    startDate: { $lte: queryDate },
    endDate: { $gte: queryDate },
  });

  if (dieselPrices.length === 0) {
    return res.status(404).json({
      message: "No diesel prices found for this pump on the given date.",
    });
  }

  if (dieselPrices.length > 1) {
    return res.status(400).json({
      message: "Multiple diesel prices found for this pump on the given date.",
    });
  }

  const dieselPrice = dieselPrices[0];

  res.status(200).json(dieselPrice);
});

const fetchDieselPrice = asyncHandler(async (req, res) => {
  const id = req.params.id;

  const dieselPrice = await DieselPrice.findById(id).populate("pump");

  if (!dieselPrice) {
    return res.status(404).json({ message: "Diesel price not found" });
  }

  res.status(200).json(dieselPrice);
});

const updateDieselPrice = asyncHandler(async (req, res) => {
  const id = req.params.id;
  const { pump, price, startDate, endDate } = req.body;

  // Check for overlapping diesel price entries (excluding the current one)
  const overlappingDieselPrice = await DieselPrice.findOne({
    _id: { $ne: id }, // Exclude the current record
    pump,
    $or: [{ startDate: { $lte: endDate }, endDate: { $gte: startDate } }],
  });

  if (overlappingDieselPrice) {
    return res.status(400).json({
      message: "A diesel price entry already exists in the given date range.",
    });
  }

  // Update diesel price entry
  const updatedDieselPrice = await DieselPrice.findByIdAndUpdate(
    id,
    { pump, price, startDate, endDate },
    { new: true, runValidators: true }
  ).populate("pump");

  if (!updatedDieselPrice) {
    return res.status(404).json({ message: "Diesel price not found" });
  }

  res.status(200).json(updatedDieselPrice);
});

const deleteDieselPrice = asyncHandler(async (req, res) => {
  const id = req.params.id;
  const deletedDieselPrice = await DieselPrice.findByIdAndDelete(id);

  if (!deletedDieselPrice) {
    return res.status(404).json({ message: "Diesel price not found" });
  }
  res.status(200).json({ message: "Diesel price deleted" });
});

module.exports = {
  createDieselPrice,
  fetchDieselPrices,
  fetchDieselPriceOnDate,
  fetchDieselPrice,
  updateDieselPrice,
  deleteDieselPrice,
};
