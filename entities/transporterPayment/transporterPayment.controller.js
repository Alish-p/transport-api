/* eslint-disable no-await-in-loop */
import mongoose from 'mongoose';
import asyncHandler from 'express-async-handler';
import Tenant from '../tenant/tenant.model.js';
import { sendTransporterPaymentNotification } from '../../services/whatsapp.service.js';
import Subtrip from '../subtrip/subtrip.model.js';
import Transporter from '../transporter/transporter.model.js';
import TransporterPayment from './transporterPayment.model.js';
import { addTenantToQuery } from '../../utils/tenant-utils.js';
import {
  recordSubtripEvent,
  SUBTRIP_EVENT_TYPES,
} from '../../helpers/subtrip-event-helper.js';
import {
  calculateTransporterPayment,
  calculateTransporterPaymentSummary,
} from './transporterPayment.utils.js';

// 💰 Create Transporter Payment Receipt
const createTransporterPaymentReceipt = asyncHandler(async (req, res) => {
  const {
    transporterId,
    associatedSubtrips,
    additionalCharges = [],
    meta,
  } = req.body;

  if (!Array.isArray(associatedSubtrips) || associatedSubtrips.length === 0) {
    return res.status(400).json({ message: "No subtrips provided." });
  }

  const session = await TransporterPayment.startSession();
  session.startTransaction();

  try {
    // 1. Fetch transporter info
    const transporter = await Transporter.findOne({
      _id: transporterId,
      tenant: req.tenant,
    });
    if (!transporter) {
      await session.abortTransaction();
      return res.status(404).json({ message: "Transporter not found." });
    }

    // 2. Fetch and filter subtrips (must not be linked and vehicle should be market)
    const subtripsRaw = await Subtrip.find({
      _id: { $in: associatedSubtrips },
      transporterPaymentReceiptId: null,
      tenant: req.tenant,
    })
      .populate({ path: "vehicleId" })
      .populate("customerId")
      .populate("expenses")
      .session(session);

    const subtrips = subtripsRaw.filter(
      (st) => st.vehicleId && !st.vehicleId.isOwn
    );

    if (subtrips.length !== associatedSubtrips.length) {
      const failed = associatedSubtrips.filter(
        (id) => !subtrips.some((s) => s._id.toString() === id.toString())
      );
      await session.abortTransaction();
      return res.status(400).json({
        message: "Some subtrips are invalid or already linked.",
        failedSubtrips: failed,
      });
    }

    // 3. Create snapshot from each subtrip using utility
    const subtripSnapshot = subtrips.map((st) => {
      const {
        effectiveFreightRate,
        totalFreightAmount,
        totalExpense,
        totalTransporterPayment,
      } = calculateTransporterPayment(st);

      return {
        subtripId: st._id,
        subtripNo: st.subtripNo,
        loadingPoint: st.loadingPoint,
        unloadingPoint: st.unloadingPoint,
        vehicleNo: st.vehicleId?.vehicleNo,
        startDate: st.startDate,
        invoiceNo: st.invoiceNo,
        customerName: st.customerId?.customerName,
        rate: st.rate,
        commissionRate: st.commissionRate,
        effectiveFreightRate,
        loadingWeight: st.loadingWeight,
        freightAmount: totalFreightAmount,
        shortageWeight: st.shortageWeight || 0,
        shortageAmount: st.shortageAmount || 0,
        expenses: st.expenses.map((ex) => ({
          expenseType: ex.expenseType,
          amount: ex.amount,
          remarks: ex.remarks,
        })),
        totalExpense,
        totalTransporterPayment,
      };
    });

    // 4. Calculate final summary and tax
    const tenant = await Tenant.findById(req.tenant).select("address.state name");
    const tenantState = tenant?.address?.state || "";
    const summary = calculateTransporterPaymentSummary(
      { associatedSubtrips: subtrips },
      transporter,
      additionalCharges,
      tenantState
    );

    // 5. Create and save receipt
    const receipt = new TransporterPayment({
      transporterId,
      associatedSubtrips,
      subtripSnapshot,
      additionalCharges,
      taxBreakup: summary.taxBreakup,
      summary,
      meta,
      tenant: req.tenant,
    });

    const saved = await receipt.save({ session });

    // 6. Link subtrips
    await Subtrip.updateMany(
      { _id: { $in: associatedSubtrips }, tenant: req.tenant },
      { $set: { transporterPaymentReceiptId: saved._id } },
      { session }
    );

    await session.commitTransaction();
    session.endSession();

    // Record events for each linked subtrip
    await Promise.all(
      associatedSubtrips.map((stId) =>
        recordSubtripEvent(
          stId,
          SUBTRIP_EVENT_TYPES.TRANSPORTER_PAYMENT_GENERATED,
          { transporterId },
          req.user,
          req.tenant
        )
      )
    );



    // Fire WhatsApp notification (non-blocking for API correctness)
    try {
      const waRes = await sendTransporterPaymentNotification({
        tenantId: req.tenant,
        transporter,
        receipt: saved,
        tenantName: tenant?.name,
      });
      const toLast4 = String(transporter?.cellNo || '').slice(-4);
      if (waRes?.skipped) {
        console.info('[WA] Skipped transporter payment message', {
          reason: waRes.reason,
          tenantId: String(req.tenant),
          transporterId: String(transporter?._id || ''),
          paymentId: saved?.paymentId,
          toLast4,
        });
      } else if (waRes?.ok) {
        const messageId = waRes?.data?.messages?.[0]?.id;
        console.info('[WA] Sent transporter payment message', {
          messageId,
          tenantId: String(req.tenant),
          transporterId: String(transporter?._id || ''),
          paymentId: saved?.paymentId,
          toLast4,
        });
      } else {
        console.error('[WA] Failed transporter payment message', {
          status: waRes?.status,
          error: waRes?.error,
          data: waRes?.data,
          tenantId: String(req.tenant),
          transporterId: String(transporter?._id || ''),
          paymentId: saved?.paymentId,
          toLast4,
        });
      }
    } catch (notifyErr) {
      console.error('[WA] Error sending transporter payment message', {
        error: notifyErr?.message || notifyErr,
        tenantId: String(req.tenant),
        transporterId: String(transporter?._id || ''),
        paymentId: saved?.paymentId,
      });
    }

    res.status(201).json(saved);
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error("Transporter payment creation failed:", err);
    res.status(500).json({ message: "Creation failed", error: err.message });
  }
});

// 💰 Create Bulk Transporter Payment Receipts
const createBulkTransporterPaymentReceipts = asyncHandler(async (req, res) => {
  const { payments } = req.body;

  if (!Array.isArray(payments) || payments.length === 0) {
    return res.status(400).json({ message: "No payment payloads provided." });
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const savedReceipts = [];

    // eslint-disable-next-line no-restricted-syntax
    for (const [idx, item] of payments.entries()) {
      const {
        transporterId,
        associatedSubtrips,
        additionalCharges = [],
        meta,
      } = item;

      // 1. Validate subtrips array
      if (
        !Array.isArray(associatedSubtrips) ||
        associatedSubtrips.length === 0
      ) {
        await session.abortTransaction();
        return res.status(400).json({
          message: `Payload #${idx + 1}: No subtrips provided.`,
          index: idx,
        });
      }

      // 2. Fetch transporter
      const transporter = await Transporter.findById(transporterId).session(
        session
      );
      if (!transporter) {
        await session.abortTransaction();
        return res.status(404).json({
          message: `Payload #${idx + 1
            }: Transporter not found (${transporterId}).`,
          index: idx,
        });
      }

      // 3. Fetch & filter subtrips
      const rawSubtrips = await Subtrip.find({
        _id: { $in: associatedSubtrips },
        transporterPaymentReceiptId: null,
        tenant: req.tenant,
      })
        .populate({ path: "vehicleId" })
        .populate("customerId")
        .populate("expenses")
        .session(session);

      const subtrips = rawSubtrips.filter(
        (st) => st.vehicleId && !st.vehicleId.isOwn
      );

      if (subtrips.length !== associatedSubtrips.length) {
        const failed = associatedSubtrips.filter(
          (id) => !subtrips.some((s) => s._id.toString() === id.toString())
        );
        // eslint-disable-next-line no-await-in-loop
        await session.abortTransaction();
        return res.status(400).json({
          message: `Payload #${idx + 1
            }: Some subtrips invalid, belong to another tenant, or already linked.`,
          failedSubtrips: failed,
          index: idx,
        });
      }

      // 4. Build subtrip snapshots
      const subtripSnapshot = subtrips.map((st) => {
        const {
          effectiveFreightRate,
          totalFreightAmount,
          totalExpense,
          totalTransporterPayment,
        } = calculateTransporterPayment(st);

        return {
          subtripId: st._id,
          subtripNo: st.subtripNo,
          loadingPoint: st.loadingPoint,
          unloadingPoint: st.unloadingPoint,
          vehicleNo: st.vehicleId.vehicleNo,
          startDate: st.startDate,
          invoiceNo: st.invoiceNo,
          customerName: st.customerId?.customerName,
          rate: st.rate,
          commissionRate: st.commissionRate,
          effectiveFreightRate,
          loadingWeight: st.loadingWeight,
          freightAmount: totalFreightAmount,
          shortageWeight: st.shortageWeight || 0,
          shortageAmount: st.shortageAmount || 0,
          expenses: st.expenses.map((ex) => ({
            expenseType: ex.expenseType,
            amount: ex.amount,
            remarks: ex.remarks,
          })),
          totalExpense,
          totalTransporterPayment,
        };
      });

      // 5. Calculate summary & tax
      const tenant = await Tenant.findById(req.tenant).select("address.state name");
      const tenantState = tenant?.address?.state || "";
      const summary = calculateTransporterPaymentSummary(
        { associatedSubtrips: subtrips },
        transporter,
        additionalCharges,
        tenantState
      );

      // 6. Create & save receipt
      const receipt = new TransporterPayment({
        transporterId,
        associatedSubtrips,
        subtripSnapshot,
        additionalCharges,
        taxBreakup: summary.taxBreakup,
        summary,
        meta,
        tenant: req.tenant,
      });

      const saved = await receipt.save({ session });
      savedReceipts.push(saved);

      // 7. Link subtrips to this receipt
      await Subtrip.updateMany(
        { _id: { $in: associatedSubtrips }, tenant: req.tenant },
        { $set: { transporterPaymentReceiptId: saved._id } },
        { session }
      );

      // Record events for each linked subtrip
      await Promise.all(
        associatedSubtrips.map((stId) =>
          recordSubtripEvent(
            stId,
            SUBTRIP_EVENT_TYPES.TRANSPORTER_PAYMENT_GENERATED,
            { transporterId },
            req.user,
            req.tenant
          )
        )
      );

      // Send WhatsApp notification per created receipt (log result, ignore failures)
      try {
        const waRes = await sendTransporterPaymentNotification({
          tenantId: req.tenant,
          transporter,
          receipt: saved,
          tenantName: tenant?.name,
        });
        const toLast4 = String(transporter?.cellNo || '').slice(-4);
        if (waRes?.skipped) {
          console.info('[WA] Skipped transporter payment message', {
            reason: waRes.reason,
            tenantId: String(req.tenant),
            transporterId: String(transporter?._id || ''),
            paymentId: saved?.paymentId,
            toLast4,
          });
        } else if (waRes?.ok) {
          const messageId = waRes?.data?.messages?.[0]?.id;
          console.info('[WA] Sent transporter payment message', {
            messageId,
            tenantId: String(req.tenant),
            transporterId: String(transporter?._id || ''),
            paymentId: saved?.paymentId,
            toLast4,
          });
        } else {
          console.error('[WA] Failed transporter payment message', {
            status: waRes?.status,
            error: waRes?.error,
            data: waRes?.data,
            tenantId: String(req.tenant),
            transporterId: String(transporter?._id || ''),
            paymentId: saved?.paymentId,
            toLast4,
          });
        }
      } catch (notifyErr) {
        console.error('[WA] Error sending transporter payment message', {
          error: notifyErr?.message || notifyErr,
          tenantId: String(req.tenant),
          transporterId: String(transporter?._id || ''),
          paymentId: saved?.paymentId,
        });
      }

    }

    // 8. Commit all
    await session.commitTransaction();
    session.endSession();

    res.status(201).json(savedReceipts);
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error("Bulk transporter payment creation failed:", err);
    res
      .status(500)
      .json({ message: "Bulk creation failed.", error: err.message });
  }
});

// Fetch All Transporter Payment Receipts with pagination and search
const fetchTransporterPaymentReceipts = asyncHandler(async (req, res) => {
  try {
    const {
      transporterId,
      subtripId,
      issueFromDate,
      issueToDate,
      status,
      hasTds,
      paymentId,
      vehicleId,
    } = req.query;
    const { limit, skip } = req.pagination;

    const query = addTenantToQuery(req);

    if (transporterId) {
      const ids = Array.isArray(transporterId)
        ? transporterId
        : [transporterId];
      query.transporterId = { $in: ids };
    }

    if (subtripId) {
      const ids = Array.isArray(subtripId) ? subtripId : [subtripId];
      query.associatedSubtrips = { $in: ids };
    }

    if (vehicleId) {
      const subtrips = await Subtrip.find({
        vehicleId,
        tenant: req.tenant,
      }).select("_id");
      const ids = subtrips.map((st) => st._id);

      if (query.associatedSubtrips && query.associatedSubtrips.$in) {
        const existingIds = query.associatedSubtrips.$in.map((id) =>
          id.toString()
        );
        const newIds = ids.map((id) => id.toString());
        const intersection = existingIds.filter((id) => newIds.includes(id));
        query.associatedSubtrips = { $in: intersection };
      } else {
        query.associatedSubtrips = { $in: ids };
      }
    }

    if (status) {
      const statuses = Array.isArray(status) ? status : [status];
      query.status = { $in: statuses };
    }

    if (paymentId) {
      query.paymentId = { $regex: paymentId, $options: "i" };
    }

    if (issueFromDate || issueToDate) {
      query.issueDate = {};
      if (issueFromDate) query.issueDate.$gte = new Date(issueFromDate);
      if (issueToDate) query.issueDate.$lte = new Date(issueToDate);
    }

    if (typeof hasTds !== "undefined") {
      const boolVal = hasTds === true || hasTds === "true" || hasTds === "1";
      query["taxBreakup.tds.amount"] = boolVal ? { $gt: 0 } : { $lte: 0 };
    }

    const aggMatch = { ...query };
    if (aggMatch.transporterId && aggMatch.transporterId.$in) {
      aggMatch.transporterId.$in = aggMatch.transporterId.$in.map(
        (id) => new mongoose.Types.ObjectId(id)
      );
    }

    const [receipts, total, statusAgg] = await Promise.all([
      TransporterPayment.find(query)
        .populate("transporterId", "transportName cellNo")
        .sort({ issueDate: -1 })
        .skip(skip)
        .limit(limit),
      TransporterPayment.countDocuments(query),
      TransporterPayment.aggregate([
        { $match: aggMatch },
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
            amount: { $sum: { $ifNull: ["$summary.netIncome", 0] } },
          },
        },
      ]),
    ]);

    const totals = {
      all: { count: total, amount: 0 },
      generated: { count: 0, amount: 0 },
      paid: { count: 0, amount: 0 },
    };

    statusAgg.forEach((ag) => {
      totals.all.amount += ag.amount;
      totals[ag._id] = { count: ag.count, amount: ag.amount };
    });

    res.status(200).json({
      receipts,
      totals,
      total,
      startRange: skip + 1,
      endRange: skip + receipts.length,
    });
  } catch (error) {
    res.status(500).json({
      message: "An error occurred while fetching transporter payment receipts",
      error: error.message,
    });
  }
});

// Fetch Single Transporter Payment Receipt
const fetchTransporterPaymentReceipt = asyncHandler(async (req, res) => {
  const receipt = await TransporterPayment.findOne({
    _id: req.params.id,
    tenant: req.tenant,
  }).populate("transporterId");

  if (!receipt) {
    res.status(404).json({ message: "Transporter Payment Receipt not found" });
    return;
  }

  res.status(200).json(receipt);
});

// Public: Fetch Single Transporter Payment Receipt by ID (no auth/tenant)
const fetchTransporterPaymentReceiptPublic = asyncHandler(async (req, res) => {
  const receipt = await TransporterPayment.findById(req.params.id).populate(
    "transporterId"
  );

  if (!receipt) {
    res.status(404).json({ message: "Transporter Payment Receipt not found" });
    return;
  }

  res.status(200).json(receipt);
});

// Update Transporter Payment Receipt
const updateTransporterPaymentReceipt = asyncHandler(async (req, res) => {
  const updatedReceipt = await TransporterPayment.findOneAndUpdate(
    { _id: req.params.id, tenant: req.tenant },
    req.body,
    {
      new: true,
    }
  )
    .populate("transporterId")
    .populate({
      path: "associatedSubtrips",
      populate: { path: "vehicleId" },
    });
  res.status(200).json(updatedReceipt);
});

// Delete Transporter Payment Receipt (atomic)
const deleteTransporterPaymentReceipt = asyncHandler(async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const receipt = await TransporterPayment.findOne({
      _id: req.params.id,
      tenant: req.tenant,
    }).session(session);

    if (!receipt) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(404)
        .json({ message: "Transporter Payment Receipt not found" });
    }

    // Unlink all associated subtrips within the same transaction
    await Subtrip.updateMany(
      { _id: { $in: receipt.associatedSubtrips }, tenant: req.tenant },
      { $unset: { transporterPaymentReceiptId: "" } },
      { session }
    );

    // Delete the receipt within the same transaction
    await TransporterPayment.findOneAndDelete(
      { _id: req.params.id, tenant: req.tenant },
      { session }
    );

    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({
      message: "Transporter Payment Receipt deleted successfully",
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error("Transporter payment deletion failed:", err);
    return res
      .status(500)
      .json({ message: "Deletion failed", error: err.message });
  }
});

export {
  createTransporterPaymentReceipt,
  createBulkTransporterPaymentReceipts,
  fetchTransporterPaymentReceipts,
  fetchTransporterPaymentReceipt,
  fetchTransporterPaymentReceiptPublic,
  updateTransporterPaymentReceipt,
  deleteTransporterPaymentReceipt,
  exportTransporterPayments,
};


// Export Transporter Payments to Excel
const exportTransporterPayments = asyncHandler(async (req, res) => {
  const {
    transporterId,
    subtripId,
    issueFromDate,
    issueToDate,
    status,
    hasTds,
    paymentId,
    vehicleId,
    columns,
  } = req.query;

  const query = addTenantToQuery(req);

  if (transporterId) {
    const ids = Array.isArray(transporterId) ? transporterId : [transporterId];
    query.transporterId = { $in: ids };
  }

  if (subtripId) {
    const ids = Array.isArray(subtripId) ? subtripId : [subtripId];
    query.associatedSubtrips = { $in: ids };
  }

  if (vehicleId) {
    const subtrips = await Subtrip.find({
      vehicleId,
      tenant: req.tenant,
    }).select("_id");
    const ids = subtrips.map((st) => st._id);

    if (query.associatedSubtrips && query.associatedSubtrips.$in) {
      const existingIds = query.associatedSubtrips.$in.map((id) =>
        id.toString()
      );
      const newIds = ids.map((id) => id.toString());
      const intersection = existingIds.filter((id) => newIds.includes(id));
      query.associatedSubtrips = { $in: intersection };
    } else {
      query.associatedSubtrips = { $in: ids };
    }
  }

  if (status) {
    const statuses = Array.isArray(status) ? status : [status];
    query.status = { $in: statuses };
  }

  if (paymentId) {
    query.paymentId = { $regex: paymentId, $options: "i" };
  }

  if (issueFromDate || issueToDate) {
    query.issueDate = {};
    if (issueFromDate) query.issueDate.$gte = new Date(issueFromDate);
    if (issueToDate) query.issueDate.$lte = new Date(issueToDate);
  }

  if (typeof hasTds !== "undefined") {
    const boolVal = hasTds === true || hasTds === "true" || hasTds === "1";
    query["taxBreakup.tds.amount"] = boolVal ? { $gt: 0 } : { $lte: 0 };
  }

  const aggMatch = { ...query };
  if (aggMatch.transporterId && aggMatch.transporterId.$in) {
    aggMatch.transporterId.$in = aggMatch.transporterId.$in.map(
      (id) => new mongoose.Types.ObjectId(id)
    );
  }

  // Column Mapping
  const COLUMN_MAPPING = {
    _id: { header: 'ID', key: '_id', width: 25 },
    paymentId: { header: 'Payment ID', key: 'paymentId', width: 20 },
    transporter: { header: 'Transporter', key: 'transporterName', width: 25 },
    subtrips: { header: 'Jobs', key: 'subtripNos', width: 30 },
    status: { header: 'Status', key: 'status', width: 15 },
    issueDate: { header: 'Issue Date', key: 'issueDate', width: 15 },
    dieselTotal: { header: 'Diesel', key: 'dieselTotal', width: 15 },
    tripAdvanceTotal: { header: 'Trip Advance', key: 'tripAdvanceTotal', width: 15 },
    podAmount: { header: 'POD Amount', key: 'podAmount', width: 15 },
    materialDamagesTotal: { header: 'Material Damages', key: 'materialDamagesTotal', width: 15 },
    latePouchPenaltyTotal: { header: 'Late Pouch Penalty', key: 'latePouchPenaltyTotal', width: 15 },
    totalShortageAmount: { header: 'Total Shortage Amount', key: 'totalShortageAmount', width: 20 },
    cgst: { header: 'CGST(Tax)', key: 'cgst', width: 15 },
    sgst: { header: 'SGST(Tax)', key: 'sgst', width: 15 },
    igst: { header: 'IGST(Tax)', key: 'igst', width: 15 },
    tds: { header: 'TDS', key: 'tds', width: 15 },
    taxableAmount: { header: 'Taxable amount', key: 'taxableAmount', width: 15 },
    additionalCharges: { header: 'Additional Charges', key: 'additionalChargesStr', width: 30 },
    amount: { header: 'Amount', key: 'amount', width: 15 },
  };

  // Determine Columns
  let exportColumns = [];
  if (columns) {
    const columnIds = columns.split(',');
    exportColumns = columnIds
      .map((id) => COLUMN_MAPPING[id])
      .filter((col) => col);
  }

  // Fallback to default columns if none selected or valid
  if (exportColumns.length === 0) {
    exportColumns = Object.values(COLUMN_MAPPING);
  }

  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  res.setHeader(
    "Content-Disposition",
    "attachment; filename=TransporterPayments.xlsx"
  );

  const ExcelJS = await import('exceljs');
  const workbook = new ExcelJS.default.stream.xlsx.WorkbookWriter({
    stream: res,
    useStyles: true,
  });

  const worksheet = workbook.addWorksheet('TransporterPayments');
  worksheet.columns = exportColumns;

  // Aggregate Pipeline
  const pipeline = [
    { $match: aggMatch },
    { $sort: { issueDate: -1 } },
    {
      $lookup: {
        from: 'transporters',
        localField: 'transporterId',
        foreignField: '_id',
        as: 'transporter',
      },
    },
    { $unwind: { path: '$transporter', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        paymentId: 1,
        transporterName: '$transporter.transportName',
        status: 1,
        issueDate: 1,
        subtripSnapshot: 1, // Needed for complex calculations
        additionalCharges: 1, // Needed for POD calculations
        summary: 1,
        taxBreakup: 1,
      },
    },
  ];

  const cursor = TransporterPayment.aggregate(pipeline).cursor();

  const totals = {};
  exportColumns.forEach(col => {
    totals[col.key] = 0;
  });

  for (let doc = await cursor.next(); doc != null; doc = await cursor.next()) {
    const row = {};

    // Helper for expenses in snapshots
    const getExpenseTotal = (type) =>
      (doc.subtripSnapshot || []).reduce(
        (sum, st) =>
          sum +
          (st.expenses || [])
            .filter((e) => e.expenseType === type)
            .reduce((s, e) => s + (e.amount || 0), 0),
        0
      );

    // Dynamic field calculation based on requested columns
    const calculatedFields = {
      _id: doc._id,
      paymentId: doc.paymentId,
      transporterName: doc.transporterName,
      status: doc.status,
      issueDate: doc.issueDate ? new Date(doc.issueDate).toISOString().split('T')[0] : '-',
      subtripNos: (doc.subtripSnapshot || []).map((st) => st.subtripNo).join(', '),
      dieselTotal: getExpenseTotal('Diesel'), // Hardcoded string match with config
      tripAdvanceTotal: getExpenseTotal('Trip Advance'),
      materialDamagesTotal: getExpenseTotal('Material Damages'),
      latePouchPenaltyTotal: getExpenseTotal('Late Pouch Penalty'),
      podAmount: (doc.additionalCharges || [])
        .filter((ch) => (ch.label || '').toLowerCase().includes('pod'))
        .reduce((s, ch) => s + (ch.amount || 0), 0),
      totalShortageAmount: doc.summary?.totalShortageAmount || 0,
      cgst: doc.taxBreakup?.cgst?.amount || 0,
      sgst: doc.taxBreakup?.sgst?.amount || 0,
      igst: doc.taxBreakup?.igst?.amount || 0,
      tds: doc.taxBreakup?.tds?.amount || 0,
      taxableAmount: doc.summary?.totalFreightAmount || 0,
      amount: doc.summary?.netIncome || 0,
      additionalChargesStr: (doc.additionalCharges || [])
        .map((ch) => `${ch.label}(\u20B9${ch.amount})`)
        .join(', '),
    };

    exportColumns.forEach((col) => {
      const val = calculatedFields[col.key];
      // Format numbers
      if (typeof val === 'number') {
        row[col.key] = Math.round(val * 100) / 100;
        totals[col.key] += val;
      } else {
        row[col.key] = (val !== undefined && val !== null) ? val : '-';
      }
    });

    worksheet.addRow(row).commit();
  }

  // Footer Row
  const totalRow = {};
  exportColumns.forEach((col) => {
    if (col.key === 'paymentId') totalRow[col.key] = 'TOTAL';
    else if (typeof totals[col.key] === 'number' && totals[col.key] !== 0) {
      totalRow[col.key] = Math.round(totals[col.key] * 100) / 100;
    } else {
      totalRow[col.key] = '';
    }
  });

  const footerRow = worksheet.addRow(totalRow);
  footerRow.font = { bold: true };
  footerRow.commit();

  worksheet.commit();
  await workbook.commit();
});
