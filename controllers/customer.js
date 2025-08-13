const asyncHandler = require("express-async-handler");
const mongoose = require("mongoose");
const Customer = require("../model/Customer");
const Invoice = require("../model/Invoice");
const Subtrip = require("../model/Subtrip");
const { addTenantToQuery } = require("../Utils/tenant-utils");
const { INVOICE_STATUS, SUBTRIP_STATUS } = require("../constants/status");

// Create Customer
const createCustomer = asyncHandler(async (req, res) => {
  const newCustomer = new Customer({
    ...req.body,
    tenant: req.tenant,
  });
  const savedCustomer = await newCustomer.save();
  res.status(201).json(savedCustomer);
});

// Fetch Customers with pagination and optional search
const fetchCustomers = asyncHandler(async (req, res) => {
  try {
    const { search } = req.query;
    const { limit, skip } = req.pagination;

    const query = addTenantToQuery(req);

    if (search) {
      query.$or = [
        { customerName: { $regex: search, $options: "i" } },
        { cellNo: { $regex: search, $options: "i" } },
      ];
    }

    const [customers, total] = await Promise.all([
      Customer.find(query).sort({ customerName: 1 }).skip(skip).limit(limit),
      Customer.countDocuments(query),
    ]);

    res.status(200).json({
      customers,
      total,
      startRange: skip + 1,
      endRange: skip + customers.length,
    });
  } catch (error) {
    res.status(500).json({
      message: "An error occurred while fetching paginated customers",
      error: error.message,
    });
  }
});

// Fetch Light Customers (only name, state, cellNo)
const fetchCustomersSummary = asyncHandler(async (req, res) => {
  const customers = await Customer.find({ tenant: req.tenant }).select(
    "customerName state cellNo address gstEnabled"
  );
  res.status(200).json(customers);
});

// Get monthly material weight summary for a specific customer
const getCustomerMonthlyMaterialWeight = asyncHandler(async (req, res) => {
  const { month } = req.query;
  const { id } = req.params;

  if (!month) {
    return res
      .status(400)
      .json({ message: "Month query parameter required in YYYY-MM format" });
  }

  const [yearStr, monthStr] = month.split("-");
  const year = parseInt(yearStr, 10);
  const monthNum = parseInt(monthStr, 10);

  if (
    Number.isNaN(year) ||
    Number.isNaN(monthNum) ||
    monthNum < 1 ||
    monthNum > 12
  ) {
    return res
      .status(400)
      .json({ message: "Invalid month format. Use YYYY-MM" });
  }

  const startDate = new Date(Date.UTC(year, monthNum - 1, 1));
  const endDate = new Date(Date.UTC(year, monthNum, 1));

  try {
    const results = await Subtrip.aggregate([
      {
        $match: {
          tenant: req.tenant,
          customerId: new mongoose.Types.ObjectId(id),
          materialType: { $ne: null },
          startDate: { $gte: startDate, $lt: endDate },
        },
      },
      {
        $group: {
          _id: "$materialType",
          totalLoadingWeight: { $sum: { $ifNull: ["$loadingWeight", 0] } },
        },
      },
      { $match: { totalLoadingWeight: { $gt: 0 } } },
      {
        $project: {
          _id: 0,
          materialType: "$_id",
          totalLoadingWeight: 1,
        },
      },
      { $sort: { totalLoadingWeight: -1 } },
    ]);

    res.status(200).json(results);
  } catch (error) {
    res.status(500).json({
      message: "An error occurred while fetching material summary",
      error: error.message,
    });
  }
});

// Get routes with subtrip counts for a specific customer
const getCustomerRoutes = asyncHandler(async (req, res) => {
  try {
    const results = await Subtrip.aggregate([
      {
        $match: {
          tenant: req.tenant,
          customerId: new mongoose.Types.ObjectId(req.params.id),
          routeCd: { $ne: null },
        },
      },
      {
        $lookup: {
          from: "trips",
          localField: "tripId",
          foreignField: "_id",
          as: "trip",
        },
      },
      { $unwind: "$trip" },
      {
        $lookup: {
          from: "vehicles",
          localField: "trip.vehicleId",
          foreignField: "_id",
          as: "vehicle",
        },
      },
      { $unwind: "$vehicle" },
      {
        $group: {
          _id: "$routeCd",
          subtripCount: { $sum: 1 },
          ownSubtripCount: { $sum: { $cond: ["$vehicle.isOwn", 1, 0] } },
          marketSubtripCount: { $sum: { $cond: ["$vehicle.isOwn", 0, 1] } },
        },
      },
      { $sort: { subtripCount: -1 } },
      {
        $lookup: {
          from: "routes",
          localField: "_id",
          foreignField: "_id",
          as: "route",
        },
      },
      { $unwind: "$route" },
      {
        $project: {
          _id: 0,
          routeId: "$_id",
          routeName: "$route.routeName",
          fromPlace: "$route.fromPlace",
          toPlace: "$route.toPlace",
          subtripCount: 1,
          ownSubtripCount: 1,
          marketSubtripCount: 1,
        },
      },
    ]);

    res.status(200).json(results);
  } catch (error) {
    res.status(500).json({
      message: "An error occurred while fetching routes",
      error: error.message,
    });
  }
});

// Get invoice amount summary for a specific customer
const getCustomerInvoiceAmountSummary = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const customerId = new mongoose.Types.ObjectId(id);

    const [generatedAgg, paidAgg, pendingAgg] = await Promise.all([
      Invoice.aggregate([
        {
          $match: {
            tenant: req.tenant,
            customerId,
            invoiceStatus: {
              $in: [INVOICE_STATUS.PENDING, INVOICE_STATUS.OVERDUE],
            },
          },
        },
        {
          $group: {
            _id: null,
            total: { $sum: { $ifNull: ["$netTotal", 0] } },
          },
        },
      ]),
      Invoice.aggregate([
        {
          $match: {
            tenant: req.tenant,
            customerId,
            invoiceStatus: INVOICE_STATUS.RECEIVED,
          },
        },
        {
          $group: {
            _id: null,
            total: { $sum: { $ifNull: ["$netTotal", 0] } },
          },
        },
      ]),
      Subtrip.aggregate([
        {
          $match: {
            tenant: req.tenant,
            customerId,
            $and: [
              {
                $or: [{ invoiceId: { $exists: false } }, { invoiceId: null }],
              },
              {
                subtripStatus: {
                  $in: [
                    SUBTRIP_STATUS.LOADED,
                    SUBTRIP_STATUS.ERROR,
                    SUBTRIP_STATUS.RECEIVED,
                  ],
                },
              },
            ],
          },
        },
        {
          $group: {
            _id: null,
            total: {
              $sum: {
                $multiply: [
                  { $ifNull: ["$loadingWeight", 0] },
                  { $ifNull: ["$rate", 0] },
                ],
              },
            },
          },
        },
      ]),
    ]);

    const generatedAmount = generatedAgg[0]?.total || 0;
    const paidAmount = paidAgg[0]?.total || 0;
    const pendingAmount = pendingAgg[0]?.total || 0;

    res.status(200).json({ generatedAmount, paidAmount, pendingAmount });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error });
  }
});

// Fetch invoices for a specific customer
const getCustomerInvoices = asyncHandler(async (req, res) => {
  const invoices = await Invoice.find({
    customerId: req.params.id,
    tenant: req.tenant,
  });

  res.status(200).json(invoices);
});

// Get subtrip monthly data (own vs market) for a specific customer
const getCustomerSubtripMonthlyData = asyncHandler(async (req, res) => {
  const yearParam = parseInt(req.query.year, 10);
  const year = Number.isNaN(yearParam)
    ? new Date().getUTCFullYear()
    : yearParam;

  const { id } = req.params;

  const startOfYear = new Date(Date.UTC(year, 0, 1));
  const endOfYear = new Date(Date.UTC(year + 1, 0, 1));

  try {
    const results = await Subtrip.aggregate([
      {
        $match: {
          tenant: req.tenant,
          customerId: new mongoose.Types.ObjectId(id),
          startDate: { $gte: startOfYear, $lt: endOfYear },
          isEmpty: false,
        },
      },
      {
        $lookup: {
          from: "trips",
          localField: "tripId",
          foreignField: "_id",
          as: "trip",
        },
      },
      { $unwind: "$trip" },
      {
        $lookup: {
          from: "vehicles",
          localField: "trip.vehicleId",
          foreignField: "_id",
          as: "vehicle",
        },
      },
      { $unwind: "$vehicle" },
      {
        $group: {
          _id: { month: { $month: "$startDate" }, isOwn: "$vehicle.isOwn" },
          count: { $sum: 1 },
        },
      },
    ]);

    const own = Array(12).fill(0);
    const market = Array(12).fill(0);

    results.forEach((r) => {
      const monthIndex = r._id.month - 1;
      if (r._id.isOwn) own[monthIndex] = r.count;
      else market[monthIndex] = r.count;
    });

    res.status(200).json({ year, own, market });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error });
  }
});

// Fetch Single Customer
const fetchCustomer = asyncHandler(async (req, res) => {
  const customer = await Customer.findOne({
    _id: req.params.id,
    tenant: req.tenant,
  });

  if (!customer) {
    res.status(404).json({ message: "Customer not found" });
    return;
  }

  const invoices = await Invoice.find({
    customerId: req.params.id,
    tenant: req.tenant,
  }).select("_id invoiceNo issueDate dueDate netTotal");

  const currentYear = new Date().getUTCFullYear();
  const marchStart = new Date(Date.UTC(currentYear, 2, 1));
  const aprilStart = new Date(Date.UTC(currentYear, 3, 1));

  const analytics = await Subtrip.aggregate([
    {
      $match: {
        customerId: new mongoose.Types.ObjectId(req.params.id),
        startDate: { $gte: marchStart, $lt: aprilStart },
        isEmpty: false,
      },
    },
    {
      $group: {
        _id: "$materialType",
        loadingWeightMoved: { $sum: { $ifNull: ["$loadingWeight", 0] } },
        freightAmount: {
          $sum: {
            $multiply: [
              { $ifNull: ["$loadingWeight", 0] },
              { $ifNull: ["$rate", 0] },
            ],
          },
        },
      },
    },
    {
      $project: {
        _id: 0,
        materialType: "$_id",
        loadingWeightMoved: 1,
        freightAmount: 1,
      },
    },
  ]);

  res.status(200).json({
    ...customer.toObject(),
    invoices,
    analytics,
  });
});

// Update Customer
const updateCustomer = asyncHandler(async (req, res) => {
  const updatedCustomer = await Customer.findOneAndUpdate(
    { _id: req.params.id, tenant: req.tenant },
    req.body,
    {
      new: true,
    }
  );
  res.status(200).json(updatedCustomer);
});

// Delete Customer
const deleteCustomer = asyncHandler(async (req, res) => {
  const customer = await Customer.findOne({
    _id: req.params.id,
    tenant: req.tenant,
  });

  if (!customer) {
    res.status(404).json({ message: "Customer not found" });
    return;
  }

  await Customer.findOneAndDelete({ _id: req.params.id, tenant: req.tenant });
  res.status(200).json({ message: "Customer deleted successfully" });
});

//

module.exports = {
  createCustomer,
  fetchCustomers,
  fetchCustomersSummary,
  getCustomerMonthlyMaterialWeight,
  fetchCustomer,
  updateCustomer,
  deleteCustomer,
  getCustomerRoutes,
  getCustomerInvoiceAmountSummary,
  getCustomerInvoices,
  getCustomerSubtripMonthlyData,
};
