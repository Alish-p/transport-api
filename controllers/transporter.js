const asyncHandler = require("express-async-handler");
const Transporter = require("../model/Transporter");
const { addTenantToQuery } = require("../Utils/tenant-utils");

// Create Transporter
const createTransporter = asyncHandler(async (req, res) => {
  const transporter = new Transporter({ ...req.body, tenant: req.tenant });
  const newTransporter = await transporter.save();

  res.status(201).json(newTransporter);
});

// Fetch Transporters with pagination and search
const fetchTransporters = asyncHandler(async (req, res) => {
  try {
    const { search } = req.query;
    const { limit, skip } = req.pagination;

    const query = addTenantToQuery(req);

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
  const transporter = await Transporter.findOne({ _id: id, tenant: req.tenant });
  res.status(200).json(transporter);
});

// Update Transporter
const updateTransporter = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const transporter = await Transporter.findOneAndUpdate(
    { _id: id, tenant: req.tenant },
    req.body,
    { new: true }
  );

  res.status(200).json(transporter);
});

// Delete Transporter
const deleteTransporter = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const transporter = await Transporter.findOneAndDelete({
    _id: id,
    tenant: req.tenant,
  });

  res.status(200).json(transporter);
});

module.exports = {
  createTransporter,
  fetchTransporters,
  fetchTransporterById,
  updateTransporter,
  deleteTransporter,
};
