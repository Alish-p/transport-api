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
  const { id } = req.params;
  const pump = await Pump.findById(id);

  if (!pump) {
    res.status(404);
    throw new Error("Pump not found");
  }

  res.status(200).json(pump);
});

// Fetch Pumps with pagination and search
const fetchPumps = asyncHandler(async (req, res) => {
  try {
    const { search } = req.query;
    const { limit, skip } = req.pagination;

    const query = {};

    if (search) {
      query.$or = [
        { pumpName: { $regex: search, $options: 'i' } },
        { placeName: { $regex: search, $options: 'i' } },
      ];
    }

    const [pumps, total] = await Promise.all([
      Pump.find(query)
        .sort({ pumpName: 1 })
        .skip(skip)
        .limit(limit),
      Pump.countDocuments(query),
    ]);

    res.status(200).json({
      pumps,
      total,
      startRange: skip + 1,
      endRange: skip + pumps.length,
    });
  } catch (error) {
    res.status(500).json({
      message: 'An error occurred while fetching paginated pumps',
      error: error.message,
    });
  }
});

// Update Pump
const updatePump = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const pump = await Pump.findByIdAndUpdate(id, req.body, { new: true });

  res.status(200).json(pump);
});

// Delete Pump
const deletePump = asyncHandler(async (req, res) => {
  const { id } = req.params;
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
