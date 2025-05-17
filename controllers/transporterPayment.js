const asyncHandler = require("express-async-handler");
const TransporterPayment = require("../model/TransporterPayment");

const Transporter = require("../model/Transporter");
const Loan = require("../model/Loan");
const Subtrip = require("../model/Subtrip");
const {
  calculateTransporterPayment,
  calculateTransporterPaymentSummary,
} = require("../Utils/transporter-payment-utils");

// 💰 Create Transporter Payment Receipt
const createTransporterPaymentReceipt = asyncHandler(async (req, res) => {
  const {
    transporterId,
    billingPeriod,
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
    const transporter = await Transporter.findById(transporterId);
    if (!transporter) {
      await session.abortTransaction();
      return res.status(404).json({ message: "Transporter not found." });
    }

    // 2. Fetch and filter subtrips (must not be linked and vehicle should be market)
    const subtripsRaw = await Subtrip.find({
      _id: { $in: associatedSubtrips },
      transporterPaymentReceiptId: null,
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
    const summary = calculateTransporterPaymentSummary(
      { associatedSubtrips: subtrips },
      transporter,
      additionalCharges
    );

    // 5. Create and save receipt
    const receipt = new TransporterPayment({
      transporterId,
      billingPeriod,
      associatedSubtrips,
      subtripSnapshot,
      additionalCharges,
      taxBreakup: summary.taxBreakup,
      summary,
      meta,
    });

    const saved = await receipt.save({ session });

    // 6. Link subtrips
    await Subtrip.updateMany(
      { _id: { $in: associatedSubtrips } },
      { $set: { transporterPaymentReceiptId: saved._id } },
      { session }
    );

    await session.commitTransaction();
    session.endSession();

    res.status(201).json(saved);
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error("Transporter payment creation failed:", err);
    res.status(500).json({ message: "Creation failed", error: err.message });
  }
});

// Fetch All Transporter Payment Receipts
const fetchTransporterPaymentReceipts = asyncHandler(async (req, res) => {
  const receipts = await TransporterPayment.find().populate("transporterId");

  res.status(200).json(receipts);
});

// Fetch Single Transporter Payment Receipt
const fetchTransporterPaymentReceipt = asyncHandler(async (req, res) => {
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
  const updatedReceipt = await TransporterPayment.findByIdAndUpdate(
    req.params.id,
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
  const receipt = await TransporterPayment.findById(req.params.id);

  if (!receipt) {
    return res
      .status(404)
      .json({ message: "Transporter Payment Receipt not found" });
  }

  // ✅ Use $in with associatedSubtrips to remove links
  await Subtrip.updateMany(
    { _id: { $in: receipt.associatedSubtrips } },
    { $unset: { transporterPaymentReceiptId: "" } }
  );

  await TransporterPayment.findByIdAndDelete(req.params.id);

  res.status(200).json({
    message: "Transporter Payment Receipt deleted successfully",
  });
});

module.exports = {
  createTransporterPaymentReceipt,
  fetchTransporterPaymentReceipts,
  fetchTransporterPaymentReceipt,
  updateTransporterPaymentReceipt,
  deleteTransporterPaymentReceipt,
};
