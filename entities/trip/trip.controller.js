import mongoose from "mongoose";
import asyncHandler from "express-async-handler";
import Trip from "./trip.model.js";
import Vehicle from "../vehicle/vehicle.model.js";
import Subtrip from "../subtrip/subtrip.model.js";
import Expense from "../expense/expense.model.js";
import { TRIP_STATUS } from "./trip.constants.js";
import { SUBTRIP_STATUS } from "../subtrip/subtrip.constants.js";
import { addTenantToQuery } from "../../utils/tenant-utils.js";

// Fetch Trips with pagination and search
const fetchTrips = asyncHandler(async (req, res) => {
  try {
    const {
      tripNo,
      driverId,
      vehicleId,
      subtripId,
      fromDate,
      toDate,
      status,
      isOwn,
      isTripSheetReady,
      numberOfSubtrips,
    } = req.query;

    const { limit, skip } = req.pagination || {};

    const query = addTenantToQuery(req);

    if (tripNo) {
      // Support partial, case-insensitive search on trip number
      const escaped = String(tripNo).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      query.tripNo = { $regex: escaped, $options: "i" };
    }
    if (driverId) query.driverId = driverId;
    // vehicleId will be applied below when considering isOwn as well
    if (subtripId) query.subtrips = subtripId;

    if (fromDate || toDate) {
      query.fromDate = {};
      if (fromDate) query.fromDate.$gte = new Date(fromDate);
      if (toDate) query.fromDate.$lte = new Date(toDate);
    }

    if (status) {
      const statuses = Array.isArray(status) ? status : [status];
      query.tripStatus = { $in: statuses };
    }

    if (numberOfSubtrips) {
      const size = parseInt(numberOfSubtrips);
      if (query.subtrips) {
        query.subtrips = { $all: [query.subtrips], $size: size };
      } else {
        query.subtrips = { $size: size };
      }
    }

    if (isTripSheetReady === "true") {
      const tripsWithNonBilledSubtrips = await Subtrip.find({
        tenant: req.tenant,
        subtripStatus: { $ne: SUBTRIP_STATUS.BILLED },
        tripId: { $ne: null },
      }).distinct("tripId");

      query._id = { $nin: tripsWithNonBilledSubtrips };
      // Ensure the trip has at least one subtrip
      query["subtrips.0"] = { $exists: true };
      query.tripStatus = TRIP_STATUS.CLOSED;
    }

    // If filtering by ownership and/or specific vehicle, resolve matching vehicles first
    const hasIsOwnFilter = typeof isOwn !== "undefined";
    if (vehicleId || hasIsOwnFilter) {
      const vehicleSearch = {};
      if (vehicleId) vehicleSearch._id = vehicleId;
      if (hasIsOwnFilter)
        vehicleSearch.isOwn = isOwn === true || isOwn === "true";

      const vehicles = await Vehicle.find(
        addTenantToQuery(req, vehicleSearch)
      ).select("_id");
      if (!vehicles.length) {
        return res.status(200).json({
          trips: [],
          total: 0,
          totalClosed: 0,
          totalOpen: 0,
          startRange: (skip || 0) + 1,
          endRange: skip || 0,
        });
      }
      query.vehicleId = { $in: vehicles.map((v) => v._id) };
    }

    const [tripsRaw, total, totalClosed, totalOpen] = await Promise.all([
      Trip.find(query)
        .populate({
          path: "subtrips",
          populate: [
            { path: "customerId", model: "Customer" },
          ],
        })
        .populate({ path: "driverId", select: "driverName driverCellNo" })
        .populate({ path: "vehicleId", select: "vehicleNo" })
        .sort({ fromDate: -1 })
        .lean()
        .skip(skip)
        .limit(limit),
      Trip.countDocuments(query),
      Trip.countDocuments({ ...query, tripStatus: TRIP_STATUS.CLOSED }),
      Trip.countDocuments({ ...query, tripStatus: TRIP_STATUS.OPEN }),
    ]);

    // Pre-calculate aggregated metrics for the frontend list view
    const trips = tripsRaw.map((trip) => {
      // KM Calculation
      let totalKm = 0;
      if (typeof trip.startKm === "number" && typeof trip.endKm === "number" && trip.endKm >= trip.startKm) {
        totalKm = trip.endKm - trip.startKm;
      }

      return {
        ...trip,
        totalIncome: trip.cachedTotalIncome || 0,
        totalExpense: trip.cachedTotalExpense || 0,
        profitAndLoss: (trip.cachedTotalIncome || 0) - (trip.cachedTotalExpense || 0),
        totalDieselLtr: trip.cachedTotalDieselLtr || 0,
        totalKm,
      };
    });

    res.status(200).json({
      trips,
      total,
      totalClosed,
      totalOpen,
      startRange: (skip || 0) + 1,
      endRange: (skip || 0) + trips.length,
    });
  } catch (error) {
    res.status(500).json({
      message: "An error occurred while fetching trips",
      error: error.message,
    });
  }
});

// Fetch minimal trip preview with pagination and search
const fetchTripsPreview = asyncHandler(async (req, res) => {
  try {
    const { search, status } = req.query;
    const { limit, skip } = req.pagination || {};

    const basePipeline = [
      {
        $lookup: {
          from: "drivers",
          localField: "driverId",
          foreignField: "_id",
          as: "driver",
        },
      },
      { $unwind: "$driver" },
      {
        $lookup: {
          from: "vehicles",
          localField: "vehicleId",
          foreignField: "_id",
          as: "vehicle",
        },
      },
      { $unwind: "$vehicle" },
    ];

    const matchStage = { tenant: req.tenant };

    if (status) {
      const statuses = Array.isArray(status) ? status : [status];
      matchStage.tripStatus = { $in: statuses };
    }

    if (search) {
      matchStage.$or = [
        { "driver.driverName": { $regex: search, $options: "i" } },
        { "vehicle.vehicleNo": { $regex: search, $options: "i" } },
      ];
    }

    if (Object.keys(matchStage).length) {
      basePipeline.push({ $match: matchStage });
    }

    const projectStage = {
      $project: {
        _id: 1,
        tripNo: 1,
        driverId: {
          driverName: "$driver.driverName",
        },
        vehicleId: {
          vehicleNo: "$vehicle.vehicleNo",
        },
        fromDate: "$fromDate",
        tripStatus: "$tripStatus",
      },
    };

    const dataPipeline = [
      ...basePipeline,
      { $sort: { fromDate: -1 } },
      projectStage,
      { $skip: skip || 0 },
      { $limit: limit || 0 },
    ];

    const countPipeline = [...basePipeline, { $count: "count" }];

    const [trips, countArr] = await Promise.all([
      Trip.aggregate(dataPipeline),
      Trip.aggregate(countPipeline),
    ]);

    const total = countArr[0]?.count || 0;

    res.status(200).json({
      trips,
      total,
      startRange: (skip || 0) + 1,
      endRange: (skip || 0) + trips.length,
    });
  } catch (error) {
    res.status(500).json({
      message: "An error occurred while fetching trip previews",
      error: error.message,
    });
  }
});

const fetchVehicleActiveTrip = asyncHandler(async (req, res) => {
  const { vehicleId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(vehicleId)) {
    res.status(400).json({ message: "Invalid vehicle id" });
    return;
  }

  const activeTrip = await Trip.findOne({
    tenant: req.tenant,
    vehicleId,
    tripStatus: TRIP_STATUS.OPEN,
  })
    .populate({ path: "vehicleId", select: "vehicleNo" })
    .populate({ path: "driverId", select: "driverName" })
    .populate({
      path: "subtrips",
      select:
        "subtripNo subtripStatus startDate endDate materialType customerId driverId",
      populate: [
        { path: "customerId", select: "customerName" },
        { path: "driverId", select: "driverName" },
      ],
    })
    .lean();

  if (!activeTrip) {
    res.status(404).json({ message: "Active trip not found for this vehicle" });
    return;
  }

  res.status(200).json(
    activeTrip);
});

// fetch All details of trip
const fetchTrip = asyncHandler(async (req, res) => {

  const trip = await Trip.findOne({ _id: req.params.id, tenant: req.tenant })
    .populate({
      path: "subtrips",
      populate: [
        { path: "expenses" },
        { path: "customerId" },
      ],
    })
    .populate({
      path: "vehicleId",
      populate: { path: "transporter" },
    })
    .populate("driverId");

  if (!trip) {
    res.status(404).json({ message: "Trip not found" });
    return;
  }

  res.status(200).json(trip);
});

// Update Trip and Close it
const closeTrip = asyncHandler(async (req, res) => {

  // Find the trip by ID and update it
  const trip = await Trip.findOneAndUpdate(
    { _id: req.params.id, tenant: req.tenant },
    {
      tripStatus: TRIP_STATUS.CLOSED,
      toDate: new Date(),
    },
    { new: true } // Return the updated document
  );

  if (!trip) {
    res.status(404);
    throw new Error("Trip not found");
  }

  res.status(200).json(trip);
});

// Update Trip
const updateTrip = asyncHandler(async (req, res) => {

  // 1. Fetch the trip
  const trip = await Trip.findOne({ _id: req.params.id, tenant: req.tenant });
  if (!trip) {
    res.status(404);
    throw new Error("Trip not found");
  }

  // 2. Removed check for updating a closed trip to allow editing startKm, endKm, and dates.

  // 3. If the client is trying to change the driver...
  if (
    req.body.driverId &&
    String(req.body.driverId) !== String(trip.driverId)
  ) {
    // 3a. Check for any subtrip with a salary already assigned
    const lockedCount = await Subtrip.countDocuments({
      tripId: trip._id,
      driverSalaryId: { $exists: true, $ne: null },
    });

    if (lockedCount > 0) {
      res.status(400);
      throw new Error(
        "Cannot change driver: one or more subtrips already have salary created."
      );
    }
  }

  // 4. Perform the update
  const updatedTrip = await Trip.findOneAndUpdate(
    { _id: req.params.id, tenant: req.tenant },
    req.body,
    {
      new: true,
      runValidators: true,
    }
  );

  if (!updatedTrip) {
    res.status(404);
    throw new Error("Trip not found");
  }

  res.status(200).json(updatedTrip);
});

// Delete Trip and Associated Subtrips and Expenses
const deleteTrip = asyncHandler(async (req, res) => {
  const trip = await Trip.findOne({ _id: req.params.id, tenant: req.tenant });

  if (!trip) {
    res.status(404).json({ message: "Trip not found" });
    return;
  }

  // Delete all subtrips and their expenses
  for (const subtripId of trip.subtrips) {
    await Expense.deleteMany({ subtripId });
    await Subtrip.findOneAndDelete({ _id: subtripId, tenant: req.tenant });
  }

  await Trip.findOneAndDelete({ _id: req.params.id, tenant: req.tenant });
  res.status(200).json({ message: "Trip deleted successfully" });
});

// Route Analyzer: aggregate trips by route signature
const fetchRouteAnalytics = asyncHandler(async (req, res) => {
  try {
    const { limit, skip } = req.pagination || {};
    const tenantId = req.tenant;

    // Pipeline: join subtrips, build route signature, group, compute averages
    const basePipeline = [
      // 1. Only closed trips for this tenant that have subtrips
      {
        $match: {
          tenant: tenantId,
          tripStatus: TRIP_STATUS.CLOSED,
          "subtrips.0": { $exists: true },
        },
      },
      // 2. Lookup subtrips
      {
        $lookup: {
          from: "subtrips",
          localField: "subtrips",
          foreignField: "_id",
          as: "subtripDocs",
        },
      },
      // 3. Sort subtripDocs by startDate to get correct order
      {
        $addFields: {
          subtripDocs: {
            $sortArray: { input: "$subtripDocs", sortBy: { startDate: 1 } },
          },
        },
      },
      // 4. Build route signature: "A>B>C>D" from loading/unloading points
      {
        $addFields: {
          routeSegments: {
            $reduce: {
              input: "$subtripDocs",
              initialValue: [],
              in: {
                $concatArrays: [
                  "$$value",
                  [
                    { $ifNull: ["$$this.loadingPoint", "N/A"] },
                    { $ifNull: ["$$this.unloadingPoint", "N/A"] },
                  ],
                ],
              },
            },
          },
        },
      },
      // 5. Deduplicate consecutive points (A>B>B>C => A>B>C)
      {
        $addFields: {
          routePoints: {
            $reduce: {
              input: "$routeSegments",
              initialValue: [],
              in: {
                $cond: [
                  {
                    $eq: [
                      "$$this",
                      { $arrayElemAt: ["$$value", { $subtract: [{ $size: "$$value" }, 1] }] },
                    ],
                  },
                  "$$value",
                  { $concatArrays: ["$$value", ["$$this"]] },
                ],
              },
            },
          },
        },
      },
      // 6. Create route signature string
      {
        $addFields: {
          routeSignature: {
            $reduce: {
              input: "$routePoints",
              initialValue: "",
              in: {
                $cond: [
                  { $eq: ["$$value", ""] },
                  "$$this",
                  { $concat: ["$$value", " > ", "$$this"] },
                ],
              },
            },
          },
        },
      },
      // 7. Compute per-trip KM
      {
        $addFields: {
          totalKm: {
            $cond: [
              {
                $and: [
                  { $isNumber: "$startKm" },
                  { $isNumber: "$endKm" },
                  { $gte: ["$endKm", "$startKm"] },
                ],
              },
              { $subtract: ["$endKm", "$startKm"] },
              0,
            ],
          },
          profitAndLoss: {
            $subtract: [
              { $ifNull: ["$cachedTotalIncome", 0] },
              { $ifNull: ["$cachedTotalExpense", 0] },
            ],
          },
        },
      },
      // 8. Lookup vehicle & driver for per-trip details
      {
        $lookup: {
          from: "vehicles",
          localField: "vehicleId",
          foreignField: "_id",
          as: "vehicleDoc",
        },
      },
      { $unwind: { path: "$vehicleDoc", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "drivers",
          localField: "driverId",
          foreignField: "_id",
          as: "driverDoc",
        },
      },
      { $unwind: { path: "$driverDoc", preserveNullAndEmptyArrays: true } },
      // 9. Group by routeSignature
      {
        $group: {
          _id: "$routeSignature",
          tripCount: { $sum: 1 },
          avgIncome: { $avg: { $ifNull: ["$cachedTotalIncome", 0] } },
          avgExpense: { $avg: { $ifNull: ["$cachedTotalExpense", 0] } },
          avgDieselLtr: { $avg: { $ifNull: ["$cachedTotalDieselLtr", 0] } },
          avgKm: { $avg: "$totalKm" },
          avgProfit: { $avg: "$profitAndLoss" },
          trips: {
            $push: {
              _id: "$_id",
              tripNo: "$tripNo",
              fromDate: "$fromDate",
              toDate: "$toDate",
              vehicleNo: "$vehicleDoc.vehicleNo",
              driverName: "$driverDoc.driverName",
              totalIncome: { $ifNull: ["$cachedTotalIncome", 0] },
              totalExpense: { $ifNull: ["$cachedTotalExpense", 0] },
              totalDieselLtr: { $ifNull: ["$cachedTotalDieselLtr", 0] },
              totalKm: "$totalKm",
              profitAndLoss: "$profitAndLoss",
              subtripCount: { $size: { $ifNull: ["$subtrips", []] } },
            },
          },
        },
      },
      // 10. Sort by trip count descending (most popular routes first)
      { $sort: { tripCount: -1 } },
    ];

    // Count total unique routes
    const countPipeline = [...basePipeline, { $count: "count" }];
    const [countResult] = await Trip.aggregate(countPipeline);
    const total = countResult?.count || 0;

    // Paginated data pipeline
    const dataPipeline = [
      ...basePipeline,
      { $skip: skip || 0 },
      { $limit: limit || 10 },
      // Round averages
      {
        $project: {
          _id: 0,
          routeSignature: "$_id",
          tripCount: 1,
          avgIncome: { $round: ["$avgIncome", 2] },
          avgExpense: { $round: ["$avgExpense", 2] },
          avgDieselLtr: { $round: ["$avgDieselLtr", 2] },
          avgKm: { $round: ["$avgKm", 2] },
          avgProfit: { $round: ["$avgProfit", 2] },
          trips: 1,
        },
      },
    ];

    const routes = await Trip.aggregate(dataPipeline);

    // Compute deviation percentages for each trip within its route group
    for (const route of routes) {
      for (const trip of route.trips) {
        trip.deviations = {
          income: route.avgIncome ? Math.round(((trip.totalIncome - route.avgIncome) / route.avgIncome) * 10000) / 100 : 0,
          expense: route.avgExpense ? Math.round(((trip.totalExpense - route.avgExpense) / route.avgExpense) * 10000) / 100 : 0,
          diesel: route.avgDieselLtr ? Math.round(((trip.totalDieselLtr - route.avgDieselLtr) / route.avgDieselLtr) * 10000) / 100 : 0,
          km: route.avgKm ? Math.round(((trip.totalKm - route.avgKm) / route.avgKm) * 10000) / 100 : 0,
          profit: route.avgProfit ? Math.round(((trip.profitAndLoss - route.avgProfit) / Math.abs(route.avgProfit)) * 10000) / 100 : 0,
        };
      }
      // Sort trips within route by fromDate descending
      route.trips.sort((a, b) => new Date(b.fromDate) - new Date(a.fromDate));
    }

    res.status(200).json({
      routes,
      total,
      page: req.pagination?.page || 1,
      rowsPerPage: limit || 10,
    });
  } catch (error) {
    res.status(500).json({
      message: "An error occurred while fetching route analytics",
      error: error.message,
    });
  }
});

export {
  fetchTrips,
  fetchTripsPreview,
  fetchVehicleActiveTrip,
  fetchTrip,
  closeTrip,
  updateTrip,
  deleteTrip,
  exportTrips,
  fetchRouteAnalytics,
};

// Export Trips to Excel
const exportTrips = asyncHandler(async (req, res) => {
  const {
    tripNo,
    driverId,
    vehicleId,
    subtripId,
    fromDate,
    toDate,
    status,
    isOwn,
    isTripSheetReady,
    numberOfSubtrips,
    columns, // Comma separated column IDs from frontend
  } = req.query;

  const query = addTenantToQuery(req);

  if (tripNo) {
    const escaped = String(tripNo).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    query.tripNo = { $regex: escaped, $options: "i" };
  }
  if (driverId) query.driverId = driverId;
  if (subtripId) query.subtrips = subtripId;

  if (fromDate || toDate) {
    query.fromDate = {};
    if (fromDate) query.fromDate.$gte = new Date(fromDate);
    if (toDate) query.fromDate.$lte = new Date(toDate);
  }

  if (status) {
    const statuses = Array.isArray(status) ? status : [status];
    query.tripStatus = { $in: statuses };
  }

  if (numberOfSubtrips) {
    const size = parseInt(numberOfSubtrips);
    if (query.subtrips) {
      query.subtrips = { $all: [query.subtrips], $size: size };
    } else {
      query.subtrips = { $size: size };
    }
  }

  if (isTripSheetReady === "true") {
    const tripsWithNonBilledSubtrips = await Subtrip.find({
      tenant: req.tenant,
      subtripStatus: { $ne: SUBTRIP_STATUS.BILLED },
      tripId: { $ne: null },
    }).distinct("tripId");

    query._id = { $nin: tripsWithNonBilledSubtrips };
    query["subtrips.0"] = { $exists: true };
    query.tripStatus = TRIP_STATUS.CLOSED;
  }

  const hasIsOwnFilter = typeof isOwn !== "undefined";
  if (vehicleId || hasIsOwnFilter) {
    const vehicleSearch = {};
    if (vehicleId) vehicleSearch._id = vehicleId;
    if (hasIsOwnFilter) vehicleSearch.isOwn = isOwn === true || isOwn === "true";

    const vehicles = await Vehicle.find(
      addTenantToQuery(req, vehicleSearch)
    ).select("_id");

    if (!vehicles.length) {
      const ExcelJS = await import('exceljs');
      const workbook = new ExcelJS.default.stream.xlsx.WorkbookWriter({ stream: res, useStyles: true });
      const worksheet = workbook.addWorksheet('Trips');
      worksheet.commit();
      await workbook.commit();
      return;
    }
    query.vehicleId = { $in: vehicles.map((v) => v._id) };
  }

  // Column Mapping matching the Table Config IDs
  const COLUMN_MAPPING = {
    tripId: { header: 'Trip No', key: 'tripNo', width: 20 },
    vehicleNo: { header: 'Vehicle Number', key: 'vehicleNo', width: 20 },
    driverName: { header: 'Driver Name', key: 'driverName', width: 20 },
    tripStatus: { header: 'Trip Status', key: 'tripStatus', width: 15 },
    jobs: { header: 'Jobs', key: 'jobsCount', width: 10 },
    fromDate: { header: 'From Date', key: 'fromDate', width: 20 },
    toDate: { header: 'To Date', key: 'toDate', width: 20 },
    remarks: { header: 'Remarks', key: 'remarks', width: 30 },
    totalIncome: { header: 'Total Income', key: 'cachedTotalIncome', width: 15 },
    totalExpense: { header: 'Total Expense', key: 'cachedTotalExpense', width: 15 },
    profitAndLoss: { header: 'Profit & Loss', key: 'profitAndLoss', width: 15 },
    totalKm: { header: 'Total KM', key: 'totalKm', width: 15 },
    totalDieselLtr: { header: 'Total Diesel Ltr', key: 'cachedTotalDieselLtr', width: 15 },
  };

  let exportColumns = [];
  if (columns) {
    const columnIds = columns.split(',');
    exportColumns = columnIds
      .map((id) => COLUMN_MAPPING[id])
      .filter((col) => col);
  }

  if (exportColumns.length === 0) {
    // Default fallback columns
    exportColumns = Object.values(COLUMN_MAPPING);
  }

  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  res.setHeader(
    "Content-Disposition",
    "attachment; filename=Trips.xlsx"
  );

  const ExcelJS = await import('exceljs');
  const workbook = new ExcelJS.default.stream.xlsx.WorkbookWriter({
    stream: res,
    useStyles: true,
  });

  const worksheet = workbook.addWorksheet('Trips');
  worksheet.columns = exportColumns;

  // DB Query for Trips with Lookups
  const tripsRaw = await Trip.find(query)
    .populate({ path: "driverId", select: "driverName" })
    .populate({ path: "vehicleId", select: "vehicleNo" })
    .sort({ fromDate: -1 })
    .lean();

  let sums = {
    cachedTotalIncome: 0,
    cachedTotalExpense: 0,
    profitAndLoss: 0,
    cachedTotalDieselLtr: 0,
    totalKm: 0,
  };

  for (const trip of tripsRaw) {
    const row = {};

    exportColumns.forEach((col) => {
      const key = col.key;

      if (key === 'vehicleNo') {
        row[key] = trip.vehicleId?.vehicleNo || '-';
      } else if (key === 'driverName') {
        row[key] = trip.driverId?.driverName || '-';
      } else if (key === 'jobsCount') {
        row[key] = trip.subtrips?.length || 0;
      } else if (key === 'fromDate' || key === 'toDate') {
        row[key] = trip[key] ? new Date(trip[key]).toISOString().split('T')[0] : '';
      } else if (key === 'profitAndLoss') {
        const pnl = (trip.cachedTotalIncome || 0) - (trip.cachedTotalExpense || 0);
        row[key] = Math.round(pnl * 100) / 100;
        sums.profitAndLoss += row[key];
      } else if (key === 'totalKm') {
        let totalKm = 0;
        if (typeof trip.startKm === "number" && typeof trip.endKm === "number" && trip.endKm >= trip.startKm) {
          totalKm = trip.endKm - trip.startKm;
        }
        row[key] = totalKm;
        sums.totalKm += totalKm;
      } else if (key.startsWith('cachedTotal')) {
        const val = trip[key] || 0;
        row[key] = Math.round(val * 100) / 100;
        sums[key] += row[key];
      } else {
        row[key] = trip[key] || '-';
      }
    });

    worksheet.addRow(row).commit();
  }

  // Formatting sums
  const totalRow = {};
  exportColumns.forEach((col) => {
    if (col.key === 'tripNo') totalRow[col.key] = 'TOTAL';
    else if (sums[col.key] !== undefined) totalRow[col.key] = Math.round(sums[col.key] * 100) / 100;
    else totalRow[col.key] = '';
  });

  const footerRow = worksheet.addRow(totalRow);
  footerRow.font = { bold: true };
  footerRow.commit();

  worksheet.commit();
  await workbook.commit();
});
