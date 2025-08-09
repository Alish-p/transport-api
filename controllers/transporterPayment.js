/* eslint-disable no-await-in-loop */
const asyncHandler = require("express-async-handler");
const mongoose = require("mongoose");
const TransporterPayment = require("../model/TransporterPayment");

const Transporter = require("../model/Transporter");
const Subtrip = require("../model/Subtrip");
const { addTenantToQuery } = require("../Utils/tenant-utils");
const Tenant = require("../model/Tenant");
const {
  recordSubtripEvent,
  SUBTRIP_EVENT_TYPES,
} = require("../helpers/subtrip-event-helper");
const {
  calculateTransporterPayment,
  calculateTransporterPaymentSummary,
} = require("../Utils/transporter-payment-utils");

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
      .populate({
        path: "tripId",
        populate: { path: "vehicleId" },
      })
      .populate("customerId")
      .populate("expenses")
      .session(session);

    const subtrips = subtripsRaw.filter(
      (st) => st.tripId?.vehicleId && !st.tripId.vehicleId.isOwn
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
        loadingPoint: st.loadingPoint,
        unloadingPoint: st.unloadingPoint,
        vehicleNo: st.tripId?.vehicleId?.vehicleNo,
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
    const tenant = await Tenant.findById(req.tenant).select('address.state');
    const tenantState = tenant?.address?.state || '';
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
      const transporter =
        await Transporter.findById(transporterId).session(session);
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
        .populate({
          path: "tripId",
          populate: { path: "vehicleId" },
        })
        .populate("customerId")
        .populate("expenses")
        .session(session);

      const subtrips = rawSubtrips.filter(
        (st) => st.tripId?.vehicleId && !st.tripId.vehicleId.isOwn
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
          loadingPoint: st.loadingPoint,
          unloadingPoint: st.unloadingPoint,
          vehicleNo: st.tripId.vehicleId.vehicleNo,
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
      const tenant = await Tenant.findById(req.tenant).select('address.state');
      const tenantState = tenant?.address?.state || '';
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
    } = req.query;
    const { limit, skip } = req.pagination;

    const query = addTenantToQuery(req);

    if (transporterId) {
      const ids = Array.isArray(transporterId) ? transporterId : [transporterId];
      query.transporterId = { $in: ids };
    }

    if (subtripId) {
      const ids = Array.isArray(subtripId) ? subtripId : [subtripId];
      query.associatedSubtrips = { $in: ids };
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
      const boolVal =
        hasTds === true || hasTds === "true" || hasTds === "1";
      query["taxBreakup.tds.amount"] = boolVal ? { $gt: 0 } : { $lte: 0 };
    }

    const aggMatch = { ...query };
    if (aggMatch.transporterId && aggMatch.transporterId.$in) {
      aggMatch.transporterId.$in = aggMatch.transporterId.$in.map((id) =>
        new mongoose.Types.ObjectId(id)
      );
    }

    const [receipts, total, statusAgg] = await Promise.all([
      TransporterPayment.find(query)
        .populate("transporterId", "transportName cellNo")
        .select("-subtripSnapshot")
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
      populate: {
        path: "tripId",
        populate: {
          path: "vehicleId",
        },
      },
    });
  res.status(200).json(updatedReceipt);
});

// Delete Transporter Payment Receipt
const deleteTransporterPaymentReceipt = asyncHandler(async (req, res) => {
  const receipt = await TransporterPayment.findOne({
    _id: req.params.id,
    tenant: req.tenant,
  });

  if (!receipt) {
    return res
      .status(404)
      .json({ message: "Transporter Payment Receipt not found" });
  }

  // ✅ Use $in with associatedSubtrips to remove links
  await Subtrip.updateMany(
    { _id: { $in: receipt.associatedSubtrips }, tenant: req.tenant },
    { $unset: { transporterPaymentReceiptId: "" } }
  );

  await TransporterPayment.findOneAndDelete({
    _id: req.params.id,
    tenant: req.tenant,
  });

  res.status(200).json({
    message: "Transporter Payment Receipt deleted successfully",
  });
});

module.exports = {
  createTransporterPaymentReceipt,
  createBulkTransporterPaymentReceipts,
  fetchTransporterPaymentReceipts,
  fetchTransporterPaymentReceipt,
  updateTransporterPaymentReceipt,
  deleteTransporterPaymentReceipt,
};
