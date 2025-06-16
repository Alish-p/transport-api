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

// Fetch Transporters with pagination and search
const fetchPaginatedTransporters = asyncHandler(async (req, res) => {
  try {
    const { search } = req.query;
    const { limit, skip } = req.pagination;

    const query = {};

    if (search) {
      query.$or = [
        { transportName: { $regex: search, $options: 'i' } },
        { cellNo: { $regex: search, $options: 'i' } },
      ];
    }

    const [transporters, total] = await Promise.all([
      Transporter.find(query)
        .sort({ transportName: 1 })
        .skip(skip)
        .limit(limit),
      Transporter.countDocuments(query),
    ]);

    res.status(200).json({
      transporters,
      total,
      startRange: skip + 1,
      endRange: skip + transporters.length,
    });
  } catch (error) {
    res.status(500).json({
      message: 'An error occurred while fetching paginated transporters',
      error: error.message,
    });
  }
});

// Fetch Transporter by ID
const fetchTransporterById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  console.log(id);
  const transporter = await Transporter.findById(id);
  res.status(200).json(transporter);
});

// Update Transporter
const updateTransporter = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const transporter = await Transporter.findByIdAndUpdate(id, req.body, {
    new: true,
  });

  res.status(200).json(transporter);
});

// Delete Transporter
const deleteTransporter = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const transporter = await Transporter.findByIdAndDelete(id);

  res.status(200).json(transporter);
});

module.exports = {
  createTransporter,
  fetchTransporters,
  fetchPaginatedTransporters,
  fetchTransporterById,
  updateTransporter,
  deleteTransporter,
};
