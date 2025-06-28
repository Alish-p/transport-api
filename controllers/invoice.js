const asyncHandler = require("express-async-handler");
const mongoose = require("mongoose");
const Invoice = require("../model/Invoice");
const Subtrip = require("../model/Subtrip");
const Customer = require("../model/Customer");

const { INVOICE_STATUS, SUBTRIP_STATUS } = require("../constants/status");

const {
  recordSubtripEvent,
  SUBTRIP_EVENT_TYPES,
} = require("../helpers/subtrip-event-helper");

const { calculateInvoiceSummary } = require("../Utils/invoice-utils");

const createInvoice = asyncHandler(async (req, res) => {
  const {
    customerId,
    subtripIds,
    additionalCharges = [],
    notes = "",
  } = req.body;

  // 1. Fetch customer to get invoicePayWithin
  const customer = await Customer.findById(customerId);
  if (!customer) {
    return res.status(404).json({ message: "Customer not found." });
  }

  // 2. Calculate dueDate based on invoicePayWithin
  const payWithin = customer.invoicePayWithin || 10;
  const dueDate = new Date(Date.now() + payWithin * 24 * 60 * 60 * 1000);

  // 3. Basic validations
  if (!Array.isArray(subtripIds) || subtripIds.length === 0) {
    return res
      .status(400)
      .json({ message: "No subtrips provided for invoicing." });
  }

  const session = await Invoice.startSession();
  session.startTransaction();

  try {
    // 4.1 Increment currentInvoiceSerialNumber on Customer (in same session)
    //    This returns the updated customer doc with the new serial.
    const updatedCustomer = await Customer.findByIdAndUpdate(
      customerId,
      { $inc: { currentInvoiceSerialNumber: 1 } },
      { new: true, session }
    );

    if (!updatedCustomer) {
      throw new Error(
        `Failed to bump currentInvoiceSerialNumber for customer ${customerId}`
      );
    }

    // 5.2 Build invoiceNo from updated customer
    const invoiceNo = `${updatedCustomer.invoicePrefix}${updatedCustomer.currentInvoiceSerialNumber}${updatedCustomer.invoiceSuffix}`;

    // 5.1 Fetch and validate subtrips
    const subtrips = await Subtrip.find({
      _id: { $in: subtripIds },
      subtripStatus: SUBTRIP_STATUS.RECEIVED,
      invoiceId: null,
    })
      .populate({
        path: "tripId",
        populate: [{ path: "vehicleId" }, { path: "driverId" }],
      })
      .session(session);

    if (subtrips.length !== subtripIds.length) {
      const failedSubtrips = subtripIds.filter(
        (id) => !subtrips.some((sub) => sub._id.toString() === id.toString())
      );
      await session.abortTransaction();
      return res.status(400).json({
        message: "Some subtrips are either not received or already invoiced.",
        failedSubtrips,
      });
    }

    // 5. Prepare snapshot
    const subtripSnapshot = subtrips.map((st) => ({
      subtripId: st._id,
      consignee: st.consignee,
      unloadingPoint: st.unloadingPoint,
      vehicleNo: st.tripId?.vehicleId?.vehicleNo,
      rate: st.rate,
      materialType: st.materialType,
      loadingWeight: st.loadingWeight,
      shortageWeight: st.shortageWeight,
      shortageAmount: st.shortageAmount,
      freightAmount: (st.rate || 0) * (st.loadingWeight || 0),
      totalAmount:
        (st.rate || 0) * (st.loadingWeight || 0) - (st.shortageAmount || 0),
      startDate: st.startDate,
      invoiceNo: st.invoiceNo,
    }));

    // 6. Summary and tax
    const summary = calculateInvoiceSummary(
      { invoicedSubTrips: subtrips, additionalCharges },
      customer
    );

    // 7. Save Invoice
    const invoice = new Invoice({
      customerId,
      invoiceNo,
      dueDate,
      notes,
      additionalCharges,
      taxBreakup: summary.taxBreakup,
      subtripSnapshot,
      invoicedSubTrips: subtripIds,
      totalAmountBeforeTax: summary.totalAmountBeforeTax,
      totalAfterTax: summary.totalAfterTax,
      netTotal: summary.netTotal,
      invoiceStatus: INVOICE_STATUS.PENDING,
    });

    const savedInvoice = await invoice.save({ session });

    // 8. Update subtrips
    for (const subtrip of subtrips) {
      subtrip.invoiceId = savedInvoice._id;
      subtrip.subtripStatus = SUBTRIP_STATUS.BILLED_PENDING;

      await recordSubtripEvent(
        subtrip._id,
        SUBTRIP_EVENT_TYPES.INVOICE_GENERATED,
        { invoiceNo: savedInvoice.invoiceNo, amount: summary.netTotal },
        req.user
      );

      await subtrip.save({ session });
    }

    await session.commitTransaction();
    session.endSession();

    res.status(201).json(savedInvoice);
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Invoice creation failed:", error);
    res
      .status(500)
      .json({ message: "Failed to create invoice", error: error.message });
  }
});

// Fetch Invoices with pagination and optional search
const fetchInvoices = asyncHandler(async (req, res) => {
  try {
    const {
      customerId,
      subtripId,
      invoiceStatus,
      issueFromDate,
      issueToDate,
      invoiceNo,
    } = req.query;
    const { limit, skip } = req.pagination;

    const query = {};

    if (customerId) {
      const ids = Array.isArray(customerId) ? customerId : [customerId];
      query.customerId = { $in: ids };
    }

    if (subtripId) {
      const ids = Array.isArray(subtripId) ? subtripId : [subtripId];
      query.invoicedSubTrips = { $in: ids };
    }

    if (invoiceStatus) {
      const statuses = Array.isArray(invoiceStatus)
        ? invoiceStatus
        : [invoiceStatus];
      query.invoiceStatus = { $in: statuses };
    }

    if (invoiceNo) {
      query.invoiceNo = { $regex: invoiceNo, $options: "i" };
    }

    if (issueFromDate || issueToDate) {
      query.issueDate = {};
      if (issueFromDate) query.issueDate.$gte = new Date(issueFromDate);
      if (issueToDate) query.issueDate.$lte = new Date(issueToDate);
    }

    // Mongoose does not cast values in aggregation pipelines
    // Cast ObjectId fields explicitly for aggregation stage
    const aggMatch = { ...query };
    if (aggMatch.customerId && aggMatch.customerId.$in) {
      aggMatch.customerId.$in = aggMatch.customerId.$in.map((id) =>
        new mongoose.Types.ObjectId(id)
      );
    }

    const [invoices, total, statusAgg] = await Promise.all([
      Invoice.find(query)
        .populate("customerId", "customerName cellNo")
        .sort({ issueDate: -1 })
        .skip(skip)
        .limit(limit),
      Invoice.countDocuments(query),
      Invoice.aggregate([
        { $match: aggMatch },
        {
          $group: {
            _id: "$invoiceStatus",
            count: { $sum: 1 },
            amount: { $sum: { $ifNull: ["$netTotal", 0] } },
          },
        },
      ]),
    ]);

    const totals = {
      all: { count: total, amount: 0 },
      pending: { count: 0, amount: 0 },
      paid: { count: 0, amount: 0 },
      overdue: { count: 0, amount: 0 },
    };

    statusAgg.forEach((ag) => {
      totals.all.amount += ag.amount;
      totals[ag._id] = { count: ag.count, amount: ag.amount };
    });

    res.status(200).json({
      invoices,
      totals,
      total,
      startRange: skip + 1,
      endRange: skip + invoices.length,
    });
  } catch (error) {
    res.status(500).json({
      message: "An error occurred while fetching paginated invoices",
      error: error.message,
    });
  }
});

// Fetch Single Invoice
const fetchInvoice = asyncHandler(async (req, res) => {
  const invoice = await Invoice.findById(req.params.id)
    .populate("customerId") // full customer info
    .populate({
      path: "invoicedSubTrips",
      populate: {
        path: "tripId",
        populate: {
          path: "vehicleId",
        },
      },
    });

  if (!invoice) {
    return res.status(404).json({ message: "Invoice not found" });
  }

  res.status(200).json({
    ...invoice.toObject(),
  });
});

const deleteInvoice = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const session = await Invoice.startSession();
  session.startTransaction();

  try {
    // 1. Load invoice with subtrip refs
    const invoice = await Invoice.findById(id).session(session);

    if (!invoice) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "Invoice not found" });
    }

    // 2. Revert invoiceId on linked subtrips
    const subtrips = await Subtrip.find({
      _id: { $in: invoice.invoicedSubTrips },
    }).session(session);

    for (const subtrip of subtrips) {
      subtrip.invoiceId = null;
      subtrip.subtripStatus = SUBTRIP_STATUS.RECEIVED; // or logic-based status if needed

      await recordSubtripEvent(
        subtrip._id,
        SUBTRIP_EVENT_TYPES.INVOICE_DELETED,
        {
          deletedInvoiceId: id,
          invoiceNo: invoice.invoiceNo,
        },
        req.user
      );

      await subtrip.save({ session });
    }

    // 3. Delete the invoice
    await Invoice.findByIdAndDelete(id).session(session);

    await session.commitTransaction();
    session.endSession();

    res.status(200).json({ message: "Invoice deleted successfully" });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Invoice deletion failed:", error);
    res
      .status(500)
      .json({ message: "Failed to delete invoice", error: error.message });
  }
});

// Update Invoice
const updateInvoice = asyncHandler(async (req, res) => {
  const { invoiceStatus } = req.body;

  // Update invoice
  const updatedInvoice = await Invoice.findByIdAndUpdate(
    req.params.id,
    req.body,
    {
      new: true,
    }
  )
    .populate("customerId")
    .populate({
      path: "invoicedSubTrips",
      populate: {
        path: "tripId",
        populate: {
          path: "vehicleId",
        },
      },
    });

  if (!updatedInvoice) {
    return res.status(404).json({ message: "Invoice not found" });
  }

  // Update subtrip statuses based on invoice status and record events
  let newSubtripStatus;
  switch (invoiceStatus) {
    case INVOICE_STATUS.PENDING:
      newSubtripStatus = SUBTRIP_STATUS.BILLED_PENDING;
      break;
    case INVOICE_STATUS.PAID:
      newSubtripStatus = SUBTRIP_STATUS.BILLED_PAID;
      break;
    case INVOICE_STATUS.OVERDUE:
      newSubtripStatus = SUBTRIP_STATUS.BILLED_OVERDUE;
      break;
  }

  if (newSubtripStatus) {
    const subtrips = await Subtrip.find({ invoiceId: req.params.id });

    for (const subtrip of subtrips) {
      subtrip.subtripStatus = newSubtripStatus;

      if (invoiceStatus === INVOICE_STATUS.PAID) {
        await recordSubtripEvent(
          subtrip._id,
          SUBTRIP_EVENT_TYPES.INVOICE_PAID,
          {
            invoiceNo: updatedInvoice.invoiceNo,
            amount: updatedInvoice.netTotal,
          },
          req.user
        );
      }

      await subtrip.save();
    }
  }

  res.status(200).json(updatedInvoice);
});

module.exports = {
  createInvoice,
  fetchInvoices,
  fetchInvoice,
  updateInvoice,
  deleteInvoice,
};
