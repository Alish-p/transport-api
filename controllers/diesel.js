const asyncHandler = require("express-async-handler");
const Pump = require("../model/Pump");
const DieselPrice = require("../model/Diesel");
const { addTenantToQuery } = require("../Utils/tenant-utils");

const createDieselPrice = asyncHandler(async (req, res) => {
  const { pump, price, startDate, endDate } = req.body;

  const existingPump = await Pump.findOne({ _id: pump, tenant: req.tenant });
  if (!existingPump) {
    return res.status(400).json({ message: "Pump not found" });
  }

  // Check if there is any overlapping diesel price entry for this pump
  const overlappingDieselPrice = await DieselPrice.findOne({
    pump,
    tenant: req.tenant,
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
    tenant: req.tenant,
  });

  const newDieselPrice = await dieselPrice.save();
  res.status(201).json(newDieselPrice);
});

// Fetch Diesel Prices with pagination and search
const fetchDieselPrices = asyncHandler(async (req, res) => {
  try {
    const { pumpId, fromDate, toDate } = req.query;
    const { limit, skip } = req.pagination || {};

    const query = addTenantToQuery(req);

    if (pumpId) {
      query.pump = pumpId;
    }

    if (fromDate || toDate) {
      query.$and = [];
      if (fromDate) {
        query.$and.push({ endDate: { $gte: new Date(fromDate) } });
      }
      if (toDate) {
        query.$and.push({ startDate: { $lte: new Date(toDate) } });
      }
      if (query.$and.length === 0) delete query.$and;
    }

    const [dieselPrices, total] = await Promise.all([
      DieselPrice.find(query)
        .populate("pump")
        .sort({ startDate: -1 })
        .skip(skip || 0)
        .limit(limit || 0),
      DieselPrice.countDocuments(query),
    ]);

    res.status(200).json({
      dieselPrices,
      total,
      startRange: (skip || 0) + 1,
      endRange: (skip || 0) + dieselPrices.length,
    });
  } catch (error) {
    res.status(500).json({
      message: "An error occurred while fetching diesel prices",
      error: error.message,
    });
  }
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
    tenant: req.tenant,
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
  const { id } = req.params;

  const dieselPrice = await DieselPrice.findOne({
    _id: id,
    tenant: req.tenant,
  }).populate("pump");

  if (!dieselPrice) {
    return res.status(404).json({ message: "Diesel price not found" });
  }

  res.status(200).json(dieselPrice);
});

const updateDieselPrice = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { pump, price, startDate, endDate } = req.body;

  // Check for overlapping diesel price entries (excluding the current one)
  const overlappingDieselPrice = await DieselPrice.findOne({
    _id: { $ne: id }, // Exclude the current record
    pump,
    tenant: req.tenant,
    $or: [{ startDate: { $lte: endDate }, endDate: { $gte: startDate } }],
  });

  if (overlappingDieselPrice) {
    return res.status(400).json({
      message: "A diesel price entry already exists in the given date range.",
    });
  }

  // Update diesel price entry
  const updatedDieselPrice = await DieselPrice.findOneAndUpdate(
    { _id: id, tenant: req.tenant },
    { pump, price, startDate, endDate },
    { new: true, runValidators: true }
  ).populate("pump");

  if (!updatedDieselPrice) {
    return res.status(404).json({ message: "Diesel price not found" });
  }

  res.status(200).json(updatedDieselPrice);
});

const deleteDieselPrice = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const deletedDieselPrice = await DieselPrice.findOneAndDelete({
    _id: id,
    tenant: req.tenant,
  });

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
