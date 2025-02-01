const asyncHandler = require("express-async-handler");
const Pump = require("../model/Pump");
const DieselPrice = require("../model/Diesel");

const createDieselPrice = asyncHandler(async (req, res) => {
  const { pump, price, startDate, endDate } = req.body;

  const existingPump = await Pump.findById(pump);
  if (!existingPump) {
    return res.status(400).json({ message: "Pump not found" });
  }

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
  const { pump, startDate, endDate } = req.query;

  let filter = {};
  if (pump) filter.pump = pump;
  if (startDate) filter.startDate = { $gte: new Date(startDate) };
  if (endDate) filter.endDate = { $lte: new Date(endDate) };

  const dieselPrices = await DieselPrice.find(filter).populate("pump");
  res.status(200).json(dieselPrices);
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
  fetchDieselPrice,
  updateDieselPrice,
  deleteDieselPrice,
};
