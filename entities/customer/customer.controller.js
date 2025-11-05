import mongoose from 'mongoose';
import asyncHandler from 'express-async-handler';
import Customer from './customer.model.js';
import Invoice from '../invoice/invoice.model.js';
import Subtrip from '../subtrip/subtrip.model.js';
import { addTenantToQuery } from '../../utils/tenant-utils.js';
import Tenant from '../tenant/tenant.model.js';
import { fetchGstDetails, normalizeGstCanonical } from '../../helpers/gst.js';
import { INVOICE_STATUS } from '../invoice/invoice.constants.js';
import { SUBTRIP_STATUS } from '../subtrip/subtrip.constants.js';

// Utility to escape RegExp special chars
const escapeRegExp = (s = "") => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Search customer by GSTIN (priority) or fuzzy name
const searchCustomer = asyncHandler(async (req, res) => {
  const { gstinNumber, name } = req.query;

  // 1) Try GSTIN exact (case-insensitive)
  if (gstinNumber && String(gstinNumber).trim()) {
    const regex = new RegExp(`^${escapeRegExp(String(gstinNumber).trim())}$`, 'i');
    const byGstin = await Customer.findOne({ tenant: req.tenant, GSTNo: regex });
    if (byGstin) {
      return res.status(200).json(byGstin);
    }
    // fall through to name search if provided
  }

  // 2) Fuzzy name search (contains, case-insensitive)
  if (name && String(name).trim()) {
    const byName = await Customer.findOne({
      tenant: req.tenant,
      customerName: { $regex: String(name).trim(), $options: 'i' },
    }).sort({ customerName: 1 });

    if (byName) {
      return res.status(200).json(byName);
    }
  }

  return res.status(404).json({ message: 'Customer not found' });
});

// Create Customer
const createCustomer = asyncHandler(async (req, res) => {
  const newCustomer = new Customer({
    ...req.body,
    tenant: req.tenant,
  });
  const savedCustomer = await newCustomer.save();
  res.status(201).json(savedCustomer);
});

// Fetch Customers with pagination and optional filters
const fetchCustomers = asyncHandler(async (req, res) => {
  try {
    // Support explicit filters from UI instead of generic `search`
    const { customerName, cellNo, gstIn } = req.query;
    const { limit, skip } = req.pagination;

    const query = addTenantToQuery(req);

    // Apply filters when provided (case-insensitive regex match)
    if (customerName) {
      query.customerName = { $regex: customerName, $options: "i" };
    }
    if (cellNo) {
      query.cellNo = { $regex: cellNo, $options: "i" };
    }
    if (gstIn) {
      // Model field is `GSTNo` — map gstIn query param to it
      query.GSTNo = { $regex: gstIn, $options: "i" };
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


// Get invoice amount summary for a specific customer [TODO -  Improve efficiency]
const getCustomerInvoiceAmountSummary = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const customerId = new mongoose.Types.ObjectId(id);

    const [
      pendingAgg,
      receivedAgg,
      unbilledAgg,
      pendingInvoices,
      receivedInvoices,
      unbilledSubtrips,
    ] = await Promise.all([
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
                  $in: [SUBTRIP_STATUS.RECEIVED],
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
      Invoice.find({
        tenant: req.tenant,
        customerId,
        invoiceStatus: {
          $in: [INVOICE_STATUS.PENDING, INVOICE_STATUS.OVERDUE],
        },
      }).select("_id invoiceNo issueDate dueDate netTotal"),
      Invoice.find({
        tenant: req.tenant,
        customerId,
        invoiceStatus: INVOICE_STATUS.RECEIVED,
      }).select("_id invoiceNo issueDate dueDate netTotal"),
      Subtrip.find({
        tenant: req.tenant,
        customerId,
        $or: [{ invoiceId: { $exists: false } }, { invoiceId: null }],
        subtripStatus: SUBTRIP_STATUS.RECEIVED,
      }).select("_id loadingPoint unloadingPoint startDate loadingWeight rate"),
    ]);

    const pendingAmount = pendingAgg[0]?.total || 0;
    const receivedAmount = receivedAgg[0]?.total || 0;
    const unbilledAmount = unbilledAgg[0]?.total || 0;

    res.status(200).json({
      pendingAmount,
      pendingInvoices,
      receivedAmount,
      receivedInvoices,
      unbilledAmount,
      unbilledSubtrips,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error });
  }
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
          from: "vehicles",
          localField: "vehicleId",
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


export {
  createCustomer,
  fetchCustomers,
  fetchCustomersSummary,
  getCustomerMonthlyMaterialWeight,
  fetchCustomer,
  updateCustomer,
  deleteCustomer,
  getCustomerInvoiceAmountSummary,
  getCustomerSubtripMonthlyData,
  searchCustomer,
};

// Lookup company details by GSTIN via external provider
export const gstLookup = asyncHandler(async (req, res) => {
  const { gstin } = req.body || {};
  const s = String(gstin || '').trim();
  if (!s) {
    return res.status(400).json({ message: 'gstin is required' });
  }
  // Basic GSTIN validation (15 chars, alphanumeric)
  if (!/^[0-9A-Z]{15}$/i.test(s)) {
    return res.status(400).json({ message: 'Invalid GSTIN format' });
  }

  // Check tenant integration flag
  const tenant = await Tenant.findById(req.tenant).select('integrations');
  const enabled = tenant?.integrations?.gstApi?.enabled;
  if (!enabled) {
    return res.status(400).json({ message: 'GST API integration is not enabled for this tenant' });
  }

  let raw;
  try {
    raw = await fetchGstDetails(s);
  } catch (err) {
    return res.status(502).json({ message: 'Failed to fetch from GST provider', error: err.message });
  }

  const canonical = normalizeGstCanonical(raw);
  return res.status(200).json({
    response: raw?.response ?? raw,
    responseStatus: raw?.responseStatus ?? 'SUCCESS',
    message: raw?.message ?? null,
    canonical,
  });
});
