// controllers/driverSalaryController.js

const asyncHandler = require("express-async-handler");
const mongoose = require("mongoose");

const DriverSalary = require("../model/DriverSalary");
const Driver = require("../model/Driver");
const Subtrip = require("../model/Subtrip");

// stubbed utils—implement these in ../utils/driver-salary-utils.js
const {
  calculateDriverSalary,
  calculateDriverSalarySummary,
} = require("../Utils/driver-salary-utils");

// 💰 Create Driver Salary Receipt
const createDriverSalary = asyncHandler(async (req, res) => {
  const {
    driverId,
    billingPeriod,
    associatedSubtrips,
    additionalPayments = [],
    additionalDeductions = [],
    meta,
  } = req.body;

  if (!Array.isArray(associatedSubtrips) || associatedSubtrips.length === 0) {
    return res.status(400).json({ message: "No subtrips provided." });
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // 1. Fetch driver
    const driver = await Driver.findById(driverId).session(session);
    if (!driver) {
      await session.abortTransaction();
      return res.status(404).json({ message: "Driver not found." });
    }

    // 2. Fetch & filter subtrips (ensure not already linked)
    const rawSubtrips = await Subtrip.find({
      _id: { $in: associatedSubtrips },
      driverSalaryReceiptId: null, // requires this field on Subtrip
    })
      .populate("tripId")
      .populate("expenses")
      .session(session);

    if (rawSubtrips.length !== associatedSubtrips.length) {
      const failed = associatedSubtrips.filter(
        (id) => !rawSubtrips.some((st) => st._id.equals(id))
      );
      await session.abortTransaction();
      return res.status(400).json({
        message: "Some subtrips invalid or already linked.",
        failedSubtrips: failed,
      });
    }

    // 3. Build subtripSnapshot
    const subtripSnapshot = rawSubtrips.map((st) => {
      const totalDriverSalary = calculateDriverSalary(st);

      return {
        subtripId: st._id,
        loadingPoint: st.loadingPoint,
        unloadingPoint: st.unloadingPoint,
        vehicleNo: st.tripId?.vehicleId?.vehicleNo,
        startDate: st.startDate,
        customerName: st.customerId?.customerName,
        invoiceNo: st.invoiceNo,
        rate: st.rate,
        loadingWeight: st.loadingWeight,
        freightAmount: st.rate,
        shortageWeight: st.shortageWeight,
        shortageAmount: st.shortageAmount,

        expenses: st.expenses.map((ex) => ({
          expenseType: ex.expenseType,
          amount: ex.amount,
          remarks: ex.remarks,
        })),

        totalDriverSalary,
      };
    });

    // 4. Calculate overall summary
    const summary = calculateDriverSalarySummary(
      { associatedSubtrips: rawSubtrips },
      driver,
      additionalPayments,
      additionalDeductions
    );

    // 5. Create & save
    const salaryDoc = new DriverSalary({
      driverId,
      billingPeriod,
      associatedSubtrips,
      subtripSnapshot,
      additionalPayments,
      additionalDeductions,
      summary,
      meta,
    });

    const saved = await salaryDoc.save({ session });

    // 6. Link subtrips back to this salary receipt
    await Subtrip.updateMany(
      { _id: { $in: associatedSubtrips } },
      { $set: { driverSalaryReceiptId: saved._id } },
      { session }
    );

    await session.commitTransaction();
    session.endSession();
    res.status(201).json(saved);
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error("Driver salary creation failed:", err);
    res.status(500).json({ message: "Creation failed", error: err.message });
  }
});

// 💰 Create Bulk Driver Salary Receipts
const createBulkDriverSalaries = asyncHandler(async (req, res) => {
  const { payments } = req.body;
  if (!Array.isArray(payments) || payments.length === 0) {
    return res.status(400).json({ message: "No payment payloads provided." });
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const savedDocs = [];

    for (const [idx, item] of payments.entries()) {
      const {
        driverId,
        billingPeriod,
        associatedSubtrips,
        additionalPayments = [],
        additionalDeductions = [],
        meta,
      } = item;

      // Validate subtrips
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

      // Fetch driver
      const driver = await Driver.findById(driverId).session(session);
      if (!driver) {
        await session.abortTransaction();
        return res.status(404).json({
          message: `Payload #${idx + 1}: Driver not found (${driverId}).`,
          index: idx,
        });
      }

      // Fetch & filter subtrips
      const rawSubtrips = await Subtrip.find({
        _id: { $in: associatedSubtrips },
        driverSalaryReceiptId: null,
      })
        .populate("tripId")
        .populate("expenses")
        .session(session);

      if (rawSubtrips.length !== associatedSubtrips.length) {
        const failed = associatedSubtrips.filter(
          (id) => !rawSubtrips.some((st) => st._id.equals(id))
        );
        await session.abortTransaction();
        return res.status(400).json({
          message: `Payload #${idx + 1}: Some subtrips invalid or linked.`,
          failedSubtrips: failed,
          index: idx,
        });
      }

      // Build subtripSnapshot
      const subtripSnapshot = rawSubtrips.map((st) => {
        const totalDriverSalary = calculateDriverSalary(st);
        return {
          subtripId: st._id,
          loadingPoint: st.loadingPoint,
          unloadingPoint: st.unloadingPoint,
          vehicleNo: st.tripId?.vehicleId?.vehicleNo,
          startDate: st.startDate,
          customerName: st.customerId?.customerName,
          invoiceNo: st.invoiceNo,
          rate: st.rate,
          loadingWeight: st.loadingWeight,
          freightAmount: st.rate,
          shortageWeight: st.shortageWeight,
          shortageAmount: st.shortageAmount,

          expenses: st.expenses.map((ex) => ({
            expenseType: ex.expenseType,
            amount: ex.amount,
            remarks: ex.remarks,
          })),

          totalDriverSalary,
        };
      });

      // Summary
      const summary = calculateDriverSalarySummary(
        { associatedSubtrips: rawSubtrips },
        driver,
        additionalPayments,
        additionalDeductions
      );

      // Save each
      const doc = new DriverSalary({
        driverId,
        billingPeriod,
        associatedSubtrips,
        subtripSnapshot,
        additionalPayments,
        additionalDeductions,
        summary,
        meta,
      });
      const saved = await doc.save({ session });
      savedDocs.push(saved);

      // Link subtrips
      await Subtrip.updateMany(
        { _id: { $in: associatedSubtrips } },
        { $set: { driverSalaryReceiptId: saved._id } },
        { session }
      );
    }

    await session.commitTransaction();
    session.endSession();
    res.status(201).json(savedDocs);
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error("Bulk driver salary creation failed:", err);
    res
      .status(500)
      .json({ message: "Bulk creation failed.", error: err.message });
  }
});

// 📋 Fetch All
const fetchDriverSalaries = asyncHandler(async (req, res) => {
  const docs = await DriverSalary.find().populate("driverId").lean();
  res.status(200).json(docs);
});

// 📋 Fetch One
const fetchDriverSalary = asyncHandler(async (req, res) => {
  const doc = await DriverSalary.findById(req.params.id)
    .populate("driverId")
    .lean();
  if (!doc) {
    return res.status(404).json({ message: "Driver Salary not found." });
  }
  res.status(200).json(doc);
});

// ✏️ Update
const updateDriverSalary = asyncHandler(async (req, res) => {
  const updated = await DriverSalary.findByIdAndUpdate(
    req.params.id,
    req.body,
    { new: true }
  ).populate("driverId");
  if (!updated) {
    return res.status(404).json({ message: "Driver Salary not found." });
  }
  res.status(200).json(updated);
});

// 🗑️ Delete
const deleteDriverSalary = asyncHandler(async (req, res) => {
  const doc = await DriverSalary.findById(req.params.id);
  if (!doc) {
    return res.status(404).json({ message: "Driver Salary not found." });
  }

  // unlink subtrips
  await Subtrip.updateMany(
    { _id: { $in: doc.associatedSubtrips } },
    { $unset: { driverSalaryReceiptId: "" } }
  );

  await DriverSalary.findByIdAndDelete(req.params.id);
  res.status(200).json({ message: "Driver Salary deleted successfully." });
});

module.exports = {
  createDriverSalary,
  createBulkDriverSalaries,
  fetchDriverSalaries,
  fetchDriverSalary,
  updateDriverSalary,
  deleteDriverSalary,
};
