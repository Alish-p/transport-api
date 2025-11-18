import asyncHandler from 'express-async-handler';
import Pump from './pump.model.js';
import FuelPrice from './fuelPrice.model.js';
import { PUMP_SEARCH_FIELDS } from './pump.constants.js';
import { addTenantToQuery } from '../../utils/tenant-utils.js';

// Create Pump
const createPump = asyncHandler(async (req, res) => {
  const pump = new Pump({ ...req.body, tenant: req.tenant });
  const newPump = await pump.save();

  res.status(201).json(newPump);
});

// fetch Pump by ID
const fetchPumpById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const pump = await Pump.findOne({ _id: id, tenant: req.tenant });

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

    const query = addTenantToQuery(req);

    if (search) {
      query.$or = PUMP_SEARCH_FIELDS.map((field) => ({
        [field]: { $regex: search, $options: 'i' },
      }));
    }

    const [pumps, total] = await Promise.all([
      Pump.find(query).sort({ name: 1 }).skip(skip).limit(limit),
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
      message: "An error occurred while fetching paginated pumps",
      error: error.message,
    });
  }
});

// Update Pump
const updatePump = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const pump = await Pump.findOneAndUpdate(
    { _id: id, tenant: req.tenant },
    req.body,
    { new: true }
  );

  res.status(200).json(pump);
});

// Delete Pump (and all related fuel prices)
const deletePump = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const pump = await Pump.findOneAndDelete({ _id: id, tenant: req.tenant });

  if (pump) {
    await FuelPrice.deleteMany({ pump: pump._id, tenant: req.tenant });
  }

  res.status(200).json(pump);
});

// -------- Fuel Price Handlers --------

// Create Fuel Price
const createFuelPrice = asyncHandler(async (req, res) => {
  const { pump, fuelType, price, fromDate, toDate } = req.body;

  const existingPump = await Pump.findOne({ _id: pump, tenant: req.tenant });
  if (!existingPump) {
    return res.status(400).json({ message: "Pump not found" });
  }

  const overlappingFuelPrice = await FuelPrice.findOne({
    pump,
    fuelType,
    tenant: req.tenant,
    $or: [{ fromDate: { $lte: toDate }, toDate: { $gte: fromDate } }],
  });

  if (overlappingFuelPrice) {
    return res.status(400).json({
      message: "A fuel price entry already exists in the given date range.",
    });
  }

  const fuelPrice = new FuelPrice({
    pump,
    fuelType,
    price,
    fromDate,
    toDate,
    tenant: req.tenant,
  });

  const newFuelPrice = await fuelPrice.save();
  res.status(201).json(newFuelPrice);
});

// Get Fuel Prices of a Pump
const fetchFuelPricesByPump = asyncHandler(async (req, res) => {
  try {
    const { pumpId } = req.params;
    const { fuelType, fromDate, toDate } = req.query;
    const { limit, skip } = req.pagination || {};

    const query = addTenantToQuery(req, { pump: pumpId });

    if (fuelType) {
      query.fuelType = fuelType;
    }

    if (fromDate || toDate) {
      query.$and = [];
      if (fromDate) {
        query.$and.push({ toDate: { $gte: new Date(fromDate) } });
      }
      if (toDate) {
        query.$and.push({ fromDate: { $lte: new Date(toDate) } });
      }
      if (query.$and.length === 0) delete query.$and;
    }

    const [fuelPrices, total] = await Promise.all([
      FuelPrice.find(query)
        .populate("pump")
        .sort({ fromDate: -1 })
        .skip(skip || 0)
        .limit(limit || 0),
      FuelPrice.countDocuments(query),
    ]);

    res.status(200).json({
      fuelPrices,
      total,
      startRange: (skip || 0) + 1,
      endRange: (skip || 0) + fuelPrices.length,
    });
  } catch (error) {
    res.status(500).json({
      message: "An error occurred while fetching fuel prices",
      error: error.message,
    });
  }
});

// Fetch current price of a fuel type for a pump
const fetchCurrentFuelPrice = asyncHandler(async (req, res) => {
  const { pumpId, fuelType } = req.params;
  const { date } = req.query;

  if (!pumpId || !fuelType) {
    return res
      .status(400)
      .json({ message: "Pump and fuelType are required." });
  }

  const queryDate = date ? new Date(date) : new Date();

  const fuelPrices = await FuelPrice.find({
    pump: pumpId,
    fuelType,
    tenant: req.tenant,
    fromDate: { $lte: queryDate },
    toDate: { $gte: queryDate },
  });

  if (fuelPrices.length === 0) {
    return res.status(404).json({
      message:
        "No fuel prices found for this pump and fuel type on the given date.",
    });
  }

  if (fuelPrices.length > 1) {
    return res.status(400).json({
      message:
        "Multiple fuel prices found for this pump and fuel type on the given date.",
    });
  }

  const fuelPrice = fuelPrices[0];

  res.status(200).json(fuelPrice);
});

// Fetch Fuel Price by ID
const fetchFuelPriceById = asyncHandler(async (req, res) => {
  const { priceId } = req.params;

  const fuelPrice = await FuelPrice.findOne({
    _id: priceId,
    tenant: req.tenant,
  }).populate("pump");

  if (!fuelPrice) {
    return res.status(404).json({ message: "Fuel price not found" });
  }

  res.status(200).json(fuelPrice);
});

// Update Fuel Price
const updateFuelPrice = asyncHandler(async (req, res) => {
  const { priceId } = req.params;
  const { pump, fuelType, price, fromDate, toDate } = req.body;

  const overlappingFuelPrice = await FuelPrice.findOne({
    _id: { $ne: priceId },
    pump,
    fuelType,
    tenant: req.tenant,
    $or: [{ fromDate: { $lte: toDate }, toDate: { $gte: fromDate } }],
  });

  if (overlappingFuelPrice) {
    return res.status(400).json({
      message: "A fuel price entry already exists in the given date range.",
    });
  }

  const updatedFuelPrice = await FuelPrice.findOneAndUpdate(
    { _id: priceId, tenant: req.tenant },
    { pump, fuelType, price, fromDate, toDate },
    { new: true, runValidators: true }
  ).populate("pump");

  if (!updatedFuelPrice) {
    return res.status(404).json({ message: "Fuel price not found" });
  }

  res.status(200).json(updatedFuelPrice);
});

// Delete Fuel Price
const deleteFuelPrice = asyncHandler(async (req, res) => {
  const { priceId } = req.params;
  const deletedFuelPrice = await FuelPrice.findOneAndDelete({
    _id: priceId,
    tenant: req.tenant,
  });

  if (!deletedFuelPrice) {
    return res.status(404).json({ message: "Fuel price not found" });
  }
  res.status(200).json({ message: "Fuel price deleted" });
});

export {
  createPump,
  fetchPumps,
  fetchPumpById,
  updatePump,
  deletePump,
  createFuelPrice,
  fetchFuelPricesByPump,
  fetchCurrentFuelPrice,
  fetchFuelPriceById,
  updateFuelPrice,
  deleteFuelPrice,
};
