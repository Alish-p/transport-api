import asyncHandler from 'express-async-handler';
import Transporter from './transporter.model.js';
import Vehicle from '../vehicle/vehicle.model.js';
import TransporterPayment from '../transporterPayment/transporterPayment.model.js';
import { addTenantToQuery } from '../../utils/tenant-utils.js';

// Create Transporter
const createTransporter = asyncHandler(async (req, res) => {
  const transporter = new Transporter({ ...req.body, tenant: req.tenant });
  const newTransporter = await transporter.save();

  res.status(201).json(newTransporter);
});

// Fetch Transporters with pagination and search
const fetchTransporters = asyncHandler(async (req, res) => {
  try {
    const { search, vehicleCount } = req.query;
    const { limit, skip } = req.pagination;

    // Base match stage
    const matchStage = {
      tenant: req.tenant,
    };

    if (search) {
      matchStage.$or = [
        { transportName: { $regex: search, $options: "i" } },
        { cellNo: { $regex: search, $options: "i" } },
      ];
    }

    // Aggregation pipeline
    const pipeline = [
      { $match: matchStage },
      {
        $lookup: {
          from: "vehicles",
          localField: "_id",
          foreignField: "transporter",
          as: "vehicles",
        },
      },
      {
        $addFields: {
          vehicleCount: { $size: "$vehicles" },
        },
      },
      // Remove vehicles array to keep response light, unless needed.
      // But we need the count.
      {
        $project: {
          vehicles: 0
        }
      }
    ];

    if (vehicleCount !== undefined && vehicleCount !== null && vehicleCount !== '') {
      pipeline.push({
        $match: {
          vehicleCount: parseInt(vehicleCount),
        }
      })
    }

    // Sort stage
    pipeline.push({ $sort: { transportName: 1 } });


    // Facet for pagination and total count
    const finalPipeline = [
      ...pipeline,
      {
        $facet: {
          metadata: [{ $count: "total" }],
          data: [{ $skip: skip }, { $limit: limit }],
        },
      },
    ];

    const result = await Transporter.aggregate(finalPipeline);

    const transporters = result[0].data;
    const total = result[0].metadata[0]?.total || 0;

    res.status(200).json({
      transporters,
      total,
      startRange: skip + 1,
      endRange: skip + transporters.length,
    });
  } catch (error) {
    res.status(500).json({
      message: "An error occurred while fetching paginated transporters",
      error: error.message,
    });
  }
});

// Fetch Transporter by ID
const fetchTransporterById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const transporter = await Transporter.findOne({
    _id: id,
    tenant: req.tenant,
  });
  res.status(200).json(transporter);
});

// Fetch all vehicles belonging to a transporter
const fetchTransporterVehicles = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const query = addTenantToQuery(req);
  query.transporter = id;

  const vehicles = await Vehicle.find(query).select(
    "vehicleNo vehicleType modelType vehicleCompany noOfTyres isOwn"
  );

  res.status(200).json(vehicles);
});

// Fetch transporter payment receipts for a transporter
const fetchTransporterPayments = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const query = addTenantToQuery(req);
  query.transporterId = id;

  const payments = await TransporterPayment.find(query)
    .select("-subtripSnapshot")
    .sort({ issueDate: -1 });

  res.status(200).json(payments);
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

export {
  createTransporter,
  fetchTransporters,
  fetchTransporterById,
  fetchTransporterVehicles,
  fetchTransporterPayments,
  updateTransporter,
  deleteTransporter,
};
