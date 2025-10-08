/* eslint-disable no-await-in-loop */
import mongoose from 'mongoose';
import asyncHandler from 'express-async-handler';
import Invoice from './invoice.model.js';
import Tenant from '../tenant/tenant.model.js';
import Subtrip from '../subtrip/subtrip.model.js';
import Customer from '../customer/customer.model.js';
import { calculateInvoiceSummary } from './invoice.utils.js';
import { addTenantToQuery } from '../../utils/tenant-utils.js';
import { INVOICE_STATUS } from './invoice.constants.js';
import { SUBTRIP_STATUS } from '../subtrip/subtrip.constants.js';
import {
  recordSubtripEvent,
  SUBTRIP_EVENT_TYPES,
} from '../../helpers/subtrip-event-helper.js';

const createInvoice = asyncHandler(async (req, res) => {
  const {
    customerId,
    subtripIds,
    additionalCharges = [],
    notes = "",
  } = req.body;

  // 1. Fetch customer to get invoicePayWithin
  const customer = await Customer.findOne({
    _id: customerId,
    tenant: req.tenant,
  });
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
    const updatedCustomer = await Customer.findOneAndUpdate(
      { _id: customerId, tenant: req.tenant },
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
      tenant: req.tenant,
    })
      .populate({ path: "vehicleId" })
      .populate({ path: "driverId" })
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
      subtripNo: st.subtripNo,
      consignee: st.consignee,
      unloadingPoint: st.unloadingPoint,
      diNumber: st.diNumber,
      vehicleNo: st.vehicleId?.vehicleNo,
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
    const tenant = await Tenant.findById(req.tenant).select("address.state");
    const tenantState = tenant?.address?.state || "";
    const summary = calculateInvoiceSummary(
      { invoicedSubTrips: subtrips, additionalCharges },
      customer,
      tenantState
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
      tenant: req.tenant,
    });

    const savedInvoice = await invoice.save({ session });

    // 8. Update subtrips
    for (const subtrip of subtrips) {
      subtrip.invoiceId = savedInvoice._id;
      subtrip.subtripStatus = SUBTRIP_STATUS.BILLED;

      await recordSubtripEvent(
        subtrip._id,
        SUBTRIP_EVENT_TYPES.INVOICE_GENERATED,
        { invoiceNo: savedInvoice.invoiceNo, amount: summary.netTotal },
        req.user,
        req.tenant
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

    const query = addTenantToQuery(req);

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
      aggMatch.customerId.$in = aggMatch.customerId.$in.map(
        (id) => new mongoose.Types.ObjectId(id)
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
  const invoice = await Invoice.findOne({
    _id: req.params.id,
    tenant: req.tenant,
  })
    .populate("customerId") // full customer info
    .populate({
      path: "invoicedSubTrips",
      populate: {
        path: "tripId",
        populate: {
          path: "vehicleId",
        },
      },
    })
    .populate({
      path: "payments.paidBy",
      select: "name",
    });

  if (!invoice) {
    return res.status(404).json({ message: "Invoice not found" });
  }

  res.status(200).json({
    ...invoice.toObject(),
  });
});


// Mark Invoice as Cancelled
const cancelInvoice = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const session = await Invoice.startSession();
  session.startTransaction();

  try {
    const invoice = await Invoice.findOneAndUpdate(
      { _id: id, tenant: req.tenant },
      { $set: { invoiceStatus: INVOICE_STATUS.CANCELLED } },
      { new: true, session }
    );

    if (!invoice) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "Invoice not found" });
    }

    const subtrips = await Subtrip.find({
      invoiceId: id,
      tenant: req.tenant,
    }).session(session);

    for (const subtrip of subtrips) {
      subtrip.subtripStatus = SUBTRIP_STATUS.RECEIVED;
      subtrip.invoiceId = null;

      await recordSubtripEvent(
        subtrip._id,
        SUBTRIP_EVENT_TYPES.INVOICE_DELETED,
        { invoiceNo: invoice.invoiceNo },
        req.user,
        req.tenant
      );

      await subtrip.save({ session });
    }

    await session.commitTransaction();
    session.endSession();

    res.status(200).json(invoice);
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Invoice cancellation failed:", error);
    res
      .status(500)
      .json({ message: "Failed to cancel invoice", error: error.message });
  }
});

// Record payment for an invoice
const payInvoice = asyncHandler(async (req, res) => {
  const { amount, referenceNumber, receivedDate } = req.body;

  if (typeof amount !== "number" || amount <= 0) {
    return res
      .status(400)
      .json({ message: "A valid payment amount is required" });
  }

  const session = await Invoice.startSession();
  session.startTransaction();

  try {
    const invoice = await Invoice.findOne({
      _id: req.params.id,
      tenant: req.tenant,
    }).session(session);

    if (!invoice) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "Invoice not found" });
    }

    const pendingAmount = invoice.netTotal - (invoice.totalReceived || 0);
    if (amount > pendingAmount) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(400)
        .json({ message: "Amount exceeds pending invoice amount" });
    }

    const newStatus =
      amount === pendingAmount
        ? INVOICE_STATUS.RECEIVED
        : INVOICE_STATUS.PARTIAL_RECEIVED;

    const updatedInvoice = await Invoice.findOneAndUpdate(
      { _id: req.params.id, tenant: req.tenant },
      {
        $push: {
          payments: {
            amount,
            paidBy: req.user?._id,
            paidAt: receivedDate || new Date(),
            referenceNumber,
          },
        },
        $inc: { totalReceived: amount },
        $set: { invoiceStatus: newStatus },
      },
      { new: true, session }
    );

    await session.commitTransaction();
    session.endSession();

    res.status(200).json(updatedInvoice);
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Invoice payment failed:", error);
    res
      .status(500)
      .json({ message: "Failed to record payment", error: error.message });
  }
});

export {
  createInvoice,
  fetchInvoices,
  fetchInvoice,
  cancelInvoice,
  payInvoice,
};
