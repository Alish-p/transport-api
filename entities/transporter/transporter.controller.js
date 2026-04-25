import asyncHandler from 'express-async-handler';
import Transporter from './transporter.model.js';
import Vehicle from '../vehicle/vehicle.model.js';
import TransporterPayment from '../transporterPayment/transporterPayment.model.js';
import Loan from '../loan/loan.model.js';
import { addTenantToQuery } from '../../utils/tenant-utils.js';
import { buildSortObject } from '../../utils/query-utils.js';

// Create Transporter
const createTransporter = asyncHandler(async (req, res) => {
  const transporter = new Transporter({ ...req.body, tenant: req.tenant });
  const newTransporter = await transporter.save();

  res.status(201).json(newTransporter);
});

// Fetch Transporters with pagination and search
const fetchTransporters = asyncHandler(async (req, res) => {
  try {
    const { search, vehicleCountMin, vehicleCountMax, includeInactive, state, paymentMode, gstEnabled, status, gstNo, panNo, vehicleId, order, orderBy } = req.query;
    const { limit, skip } = req.pagination;

    // Base match stage
    const matchStage = {
      tenant: req.tenant,
    };

    if (status === 'active') {
      matchStage.isActive = { $ne: false };
    } else if (status === 'inactive') {
      matchStage.isActive = false;
    } else if (status === 'all') {
      // no filter on isActive
    } else if (includeInactive !== 'true') {
      matchStage.isActive = { $ne: false };
    }

    if (search) {
      matchStage.$or = [
        { transportName: { $regex: search, $options: "i" } },
        { cellNo: { $regex: search, $options: "i" } },
      ];
    }

    if (state) {
      matchStage.state = Array.isArray(state) ? { $in: state } : state;
    }

    if (paymentMode) {
      matchStage.paymentMode = { $regex: paymentMode, $options: 'i' };
    }

    if (gstEnabled) {
      if (gstEnabled === 'true' || gstEnabled === true) matchStage.gstEnabled = true;
      if (gstEnabled === 'false' || gstEnabled === false) matchStage.gstEnabled = false;
    }

    if (gstNo) {
      matchStage.gstNo = { $regex: gstNo, $options: 'i' };
    }

    if (panNo) {
      matchStage.panNo = { $regex: panNo, $options: 'i' };
    }

    if (vehicleId) {
      const vehicle = await Vehicle.findOne({ _id: vehicleId, tenant: req.tenant });
      if (vehicle && vehicle.transporter) {
        matchStage._id = vehicle.transporter;
      } else {
        // If vehicle has no transporter, or doesn't exist, we return no results
        matchStage._id = null;
      }
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

    {
      const vcMatch = {};
      if (vehicleCountMin !== undefined && vehicleCountMin !== null && vehicleCountMin !== '') {
        vcMatch.$gte = parseInt(vehicleCountMin);
      }
      if (vehicleCountMax !== undefined && vehicleCountMax !== null && vehicleCountMax !== '') {
        vcMatch.$lte = parseInt(vehicleCountMax);
      }
      if (Object.keys(vcMatch).length > 0) {
        pipeline.push({ $match: { vehicleCount: vcMatch } });
      }
    }

    const sortObj = buildSortObject(orderBy, order, { transportName: 1 });

    // Sort stage
    pipeline.push({ $sort: sortObj });


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

/**
 * Fetch all orphan transporters - transporters not referenced in any vehicle, payment, or loan
 */
const fetchOrphanTransporters = asyncHandler(async (req, res) => {
  const tenant = req.tenant;

  // Get all transporter IDs that ARE referenced in related collections
  const [vehicleTransporterIds, paymentTransporterIds, loanTransporterIds] = await Promise.all([
    Vehicle.distinct('transporter', { tenant, transporter: { $exists: true, $ne: null } }),
    TransporterPayment.distinct('transporterId', { tenant }),
    Loan.distinct('borrowerId', { tenant, borrowerType: 'Transporter' }),
  ]);

  // Combine all referenced transporter IDs
  const referencedTransporterIds = [
    ...vehicleTransporterIds,
    ...paymentTransporterIds,
    ...loanTransporterIds,
  ];

  // Find active transporters NOT in the referenced list
  const orphanTransporters = await Transporter.find({
    tenant,
    isActive: { $ne: false },
    _id: { $nin: referencedTransporterIds },
  })
    .select('transportName cellNo ownerName createdAt')
    .sort({ transportName: 1 });

  res.status(200).json({
    orphanTransporters,
    count: orphanTransporters.length,
  });
});

/**
 * Soft delete (cleanup) selected transporters by setting isActive to false
 */
const cleanupTransporters = asyncHandler(async (req, res) => {
  const { transporterIds } = req.body;
  const tenant = req.tenant;

  if (!transporterIds || !Array.isArray(transporterIds) || transporterIds.length === 0) {
    res.status(400).json({ message: 'transporterIds array is required' });
    return;
  }

  // Update all selected transporters to inactive
  const result = await Transporter.updateMany(
    { _id: { $in: transporterIds }, tenant },
    { $set: { isActive: false } }
  );

  res.status(200).json({
    message: `${result.modifiedCount} transporter(s) cleaned up successfully`,
    modifiedCount: result.modifiedCount,
  });
});

// @desc    Export transporters to Excel
// @route   GET /api/transporter/export
// @access  Private
const exportTransporters = asyncHandler(async (req, res) => {
  const { search, vehicleCountMin, vehicleCountMax, includeInactive, state, paymentMode, gstEnabled, status, gstNo, panNo, vehicleId, columns, order, orderBy } = req.query;

  const matchStage = { tenant: req.tenant };

  if (status === 'active') {
    matchStage.isActive = { $ne: false };
  } else if (status === 'inactive') {
    matchStage.isActive = false;
  } else if (status === 'all') {
    // no filter on isActive
  } else if (includeInactive !== 'true') {
    matchStage.isActive = { $ne: false };
  }

  if (search) {
    matchStage.$or = [
      { transportName: { $regex: search, $options: "i" } },
      { cellNo: { $regex: search, $options: "i" } },
    ];
  }

  if (state) {
    matchStage.state = Array.isArray(state) ? { $in: state } : state;
  }

  if (paymentMode) {
    matchStage.paymentMode = { $regex: paymentMode, $options: 'i' };
  }

  if (gstEnabled) {
    if (gstEnabled === 'true' || gstEnabled === true) matchStage.gstEnabled = true;
    if (gstEnabled === 'false' || gstEnabled === false) matchStage.gstEnabled = false;
  }

  if (gstNo) {
    matchStage.gstNo = { $regex: gstNo, $options: 'i' };
  }

  if (panNo) {
    matchStage.panNo = { $regex: panNo, $options: 'i' };
  }

  if (vehicleId) {
    const vehicle = await Vehicle.findOne({ _id: vehicleId, tenant: req.tenant });
    if (vehicle && vehicle.transporter) {
      matchStage._id = vehicle.transporter;
    } else {
      matchStage._id = null;
    }
  }

  // Pre-calculate vehicle counts for all matching transporters
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
    {
      $project: {
        vehicles: 0
      }
    }
  ];

  {
    const vcMatch = {};
    if (vehicleCountMin !== undefined && vehicleCountMin !== null && vehicleCountMin !== '') {
      vcMatch.$gte = parseInt(vehicleCountMin);
    }
    if (vehicleCountMax !== undefined && vehicleCountMax !== null && vehicleCountMax !== '') {
      vcMatch.$lte = parseInt(vehicleCountMax);
    }
    if (Object.keys(vcMatch).length > 0) {
      pipeline.push({ $match: { vehicleCount: vcMatch } });
    }
  }

  // Define column mappings according to frontend transproter config
  const COLUMN_MAPPING = {
    transportName: { header: 'Transporter Name', key: 'transportName', width: 25 },
    ownerName: { header: 'Owner Name', key: 'ownerName', width: 20 },
    cellNo: { header: 'Phone Number', key: 'cellNo', width: 15 },
    address: { header: 'Address', key: 'address', width: 30 },
    city: { header: 'City', key: 'city', width: 15 },
    state: { header: 'State', key: 'state', width: 15 },
    pincode: { header: 'Pincode', key: 'pincode', width: 10 },
    panNo: { header: 'Pan No', key: 'panNo', width: 15 },
    gstEnabled: { header: 'GST Enabled', key: 'gstEnabled', width: 15 },
    gstNo: { header: 'GST No', key: 'gstNo', width: 20 },
    accountNo: { header: 'Account No', key: 'accountNo', width: 20 },
    ifscCode: { header: 'IFSC Code', key: 'ifscCode', width: 15 },
    bankName: { header: 'Bank Name', key: 'bankName', width: 20 },
    vehicleCount: { header: 'Active Vehicles', key: 'vehicleCount', width: 15 },
  };

  let exportColumns = [];
  if (columns) {
    const columnIds = columns.split(',');
    exportColumns = columnIds
      .map((id) => COLUMN_MAPPING[id])
      .filter((col) => col);
  }

  if (exportColumns.length === 0) {
    exportColumns = Object.values(COLUMN_MAPPING);
  }

  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  res.setHeader(
    "Content-Disposition",
    "attachment; filename=Transporters.xlsx"
  );

  const ExcelJS = await import('exceljs');
  const workbook = new ExcelJS.default.stream.xlsx.WorkbookWriter({
    stream: res,
    useStyles: true,
  });

  const worksheet = workbook.addWorksheet('Transporters');
  worksheet.columns = exportColumns;

  const sortObj = buildSortObject(orderBy, order, { transportName: 1 });

  // We sort them and pass through memory to insert
  pipeline.push({ $sort: sortObj });

  const transporters = await Transporter.aggregate(pipeline);

  for (const doc of transporters) {
    const row = {};

    exportColumns.forEach((col) => {
      const key = col.key;
      if (key === 'gstEnabled') {
        row[key] = doc[key] ? 'Yes' : 'No';
      } else {
        row[key] = (doc[key] !== undefined && doc[key] !== null) ? doc[key] : '-';
      }
    });

    worksheet.addRow(row).commit();
  }

  worksheet.commit();
  await workbook.commit();
});

export {
  createTransporter,
  fetchTransporters,
  fetchTransporterById,
  fetchTransporterVehicles,
  fetchTransporterPayments,
  updateTransporter,
  deleteTransporter,
  fetchOrphanTransporters,
  cleanupTransporters,
  exportTransporters,
};

