const asyncHandler = require("express-async-handler");
const Transporter = require("../model/Transporter");

// Create Transporter
const createTransporter = asyncHandler(async (req, res) => {
  const transporter = new Transporter({ ...req.body });
  const newTransporter = await transporter.save();

  res.status(201).json(newTransporter);
});

// Fetch Transporters
const fetchTransporters = asyncHandler(async (req, res) => {
  const transporters = await Transporter.find();
  res.status(200).json(transporters);
});

// Fetch Transporter by ID
const fetchTransporterById = asyncHandler(async (req, res) => {
  const id = req.params.id;
  console.log(id);
  const transporter = await Transporter.findById(id);
  res.status(200).json(transporter);
});

// Update Transporter
const updateTransporter = asyncHandler(async (req, res) => {
  const id = req.params.id;
  const transporter = await Transporter.findByIdAndUpdate(id, req.body, {
    new: true,
  });

  res.status(200).json(transporter);
});

// Delete Transporter
const deleteTransporter = asyncHandler(async (req, res) => {
  const id = req.params.id;
  const transporter = await Transporter.findByIdAndDelete(id);

  res.status(200).json(transporter);
});

module.exports = {
  createTransporter,
  fetchTransporters,
  fetchTransporterById,
  updateTransporter,
  deleteTransporter,
};
