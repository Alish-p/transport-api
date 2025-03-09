const asyncHandler = require("express-async-handler");
const Pump = require("../model/Pump");

// Create Pump
const createPump = asyncHandler(async (req, res) => {
  const pump = new Pump({ ...req.body });
  const newPump = await pump.save();

  res.status(201).json(newPump);
});

// fetch Pump by ID
const fetchPumpById = asyncHandler(async (req, res) => {
  const id = req.params.id;
  const pump = await Pump.findById(id);

  if (!pump) {
    res.status(404);
    throw new Error("Pump not found");
  }

  res.status(200).json(pump);
});

// Fetch Pumps
const fetchPumps = asyncHandler(async (req, res) => {
  const pumps = await Pump.find();
  res.status(200).json(pumps);
});

// Update Pump
const updatePump = asyncHandler(async (req, res) => {
  const id = req.params.id;
  const pump = await Pump.findByIdAndUpdate(id, req.body, { new: true });

  res.status(200).json(pump);
});

// Delete Pump
const deletePump = asyncHandler(async (req, res) => {
  const id = req.params.id;
  const pump = await Pump.findByIdAndDelete(id);

  res.status(200).json(pump);
});

module.exports = {
  createPump,
  fetchPumps,
  fetchPumpById,
  updatePump,
  deletePump,
};
