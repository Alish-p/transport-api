// controllers/driverSalaryController.js

import mongoose from 'mongoose';
import asyncHandler from 'express-async-handler';
import Driver from '../driver/driver.model.js';
import Subtrip from '../subtrip/subtrip.model.js';
import Loan from '../loan/loan.model.js';
import DriverSalary from './driverSalary.model.js';
import {
  calculateDriverSalary,
  calculateDriverSalarySummary,
} from './driverSalary.utils.js';
import {
  recordSubtripEvent,
  SUBTRIP_EVENT_TYPES,
} from '../../helpers/subtrip-event-helper.js';

import { addTenantToQuery } from '../../utils/tenant-utils.js';
import { buildSortObject } from '../../utils/query-utils.js';

// 💰 Create Driver Salary Receipt
const createDriverSalary = asyncHandler(async (req, res) => {
  const {
    driverId,
    billingPeriod,
    associatedSubtrips,
    additionalPayments = [],
    additionalDeductions = [],
    loanDeductions = [],
    meta,
  } = req.body;

  if (!Array.isArray(associatedSubtrips) || associatedSubtrips.length === 0) {
    return res.status(400).json({ message: "No subtrips provided." });
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // 1. Fetch driver
    const driver = await Driver.findOne({
      _id: driverId,
      tenant: req.tenant,
    }).session(session);
    if (!driver) {
      await session.abortTransaction();
      return res.status(404).json({ message: "Driver not found." });
    }

    // 2. Fetch & filter subtrips (ensure not already linked)
    const rawSubtrips = await Subtrip.find({
      _id: { $in: associatedSubtrips },
      driverSalaryId: null, // requires this field on Subtrip
      tenant: req.tenant,
    })
      .populate("vehicleId")
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
        subtripNo: st.subtripNo,
        loadingPoint: st.loadingPoint,
        unloadingPoint: st.unloadingPoint,
        vehicleNo: st.vehicleId?.vehicleNo,
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
      loanDeductions,
      summary,
      meta,
      tenant: req.tenant,
    });

    const saved = await salaryDoc.save({ session });

    // 5b. Process loan deductions within the same transaction
    if (loanDeductions.length > 0) {
      for (const { loanId, amount } of loanDeductions) {
        const loan = await Loan.findOne({
          _id: loanId,
          borrowerId: driverId,
          borrowerType: 'Driver',
          status: 'active',
          tenant: req.tenant,
        }).session(session);

        if (!loan) {
          throw new Error(`Active loan ${loanId} not found for this driver`);
        }

        const paymentDate = new Date();
        loan.payments.push({
          paymentDate,
          amount,
          source: `Driver Salary ${saved.paymentId}`,
          remarks: `Deducted from Driver Salary ${saved.paymentId}`,
        });
        loan.outstandingBalance = Math.max(0, Math.round((loan.outstandingBalance - amount) * 100) / 100);
        if (loan.outstandingBalance <= 0) loan.status = 'closed';
        await loan.save({ session });
      }
    }

    // 6. Link subtrips back to this salary receipt
    await Subtrip.updateMany(
      { _id: { $in: associatedSubtrips }, tenant: req.tenant },
      { $set: { driverSalaryId: saved._id } },
      { session }
    );

    // Record events for each linked subtrip
    await Promise.all(
      associatedSubtrips.map((stId) =>
        recordSubtripEvent(
          stId,
          SUBTRIP_EVENT_TYPES.DRIVER_SALARY_GENERATED,
          { driverId, paymentId: saved.paymentId, salaryId: saved._id },
          req.user,
          req.tenant
        )
      )
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
        loanDeductions = [],
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
      const driver = await Driver.findOne({
        _id: driverId,
        tenant: req.tenant,
      }).session(session);
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
        driverSalaryId: null,
        tenant: req.tenant,
      })
        .populate("vehicleId")
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
          subtripNo: st.subtripNo,
          loadingPoint: st.loadingPoint,
          unloadingPoint: st.unloadingPoint,
          vehicleNo: st.vehicleId?.vehicleNo,
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
        loanDeductions,
        summary,
        meta,
        tenant: req.tenant,
      });
      const saved = await doc.save({ session });
      savedDocs.push(saved);

      // Process loan deductions
      if (loanDeductions.length > 0) {
        for (const { loanId, amount } of loanDeductions) {
          const loan = await Loan.findOne({
            _id: loanId,
            borrowerId: driverId,
            borrowerType: 'Driver',
            status: 'active',
            tenant: req.tenant,
          }).session(session);

          if (!loan) {
            throw new Error(`Active loan ${loanId} not found for driver ${driverId}`);
          }

          const paymentDate = new Date();
          loan.payments.push({
            paymentDate,
            amount,
            source: `Driver Salary ${saved.paymentId}`,
            remarks: `Deducted from Driver Salary ${saved.paymentId}`,
          });
          loan.outstandingBalance = Math.max(0, Math.round((loan.outstandingBalance - amount) * 100) / 100);
          if (loan.outstandingBalance <= 0) loan.status = 'closed';
          await loan.save({ session });
        }
      }

      // Link subtrips
      await Subtrip.updateMany(
        { _id: { $in: associatedSubtrips }, tenant: req.tenant },
        { $set: { driverSalaryId: saved._id } },
        { session }
      );

      // Record events for each linked subtrip
      await Promise.all(
        associatedSubtrips.map((stId) =>
          recordSubtripEvent(
            stId,
            SUBTRIP_EVENT_TYPES.DRIVER_SALARY_GENERATED,
            { driverId, paymentId: saved.paymentId, salaryId: saved._id },
            req.user,
            req.tenant
          )
        )
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
  const docs = await DriverSalary.find({ tenant: req.tenant })
    .populate("driverId")
    .lean();
  res.status(200).json(docs);
});

// Fetch Driver Salaries with pagination and optional search
const fetchPaginatedDriverSalaries = asyncHandler(async (req, res) => {
  try {
    const {
      driverId,
      subtripId,
      paymentId,
      status,
      issueFromDate,
      issueToDate,
      order,
      orderBy,
    } = req.query;
    const { limit, skip } = req.pagination;

    const query = addTenantToQuery(req);

    if (driverId) {
      const ids = Array.isArray(driverId) ? driverId : [driverId];
      query.driverId = { $in: ids };
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

    // Aggregation match
    const aggMatch = { ...query };
    if (aggMatch.driverId && aggMatch.driverId.$in) {
      aggMatch.driverId.$in = aggMatch.driverId.$in.map(
        (id) => new mongoose.Types.ObjectId(id)
      );
    }

    const sortObj = buildSortObject(orderBy, order, { issueDate: -1 });

    const [driverSalaries, total, statusAgg] = await Promise.all([
      DriverSalary.find(query)
        .populate("driverId")
        .sort(sortObj)
        .skip(skip)
        .limit(limit)
        .lean(),
      DriverSalary.countDocuments(query),
      DriverSalary.aggregate([
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
      cancelled: { count: 0, amount: 0 },
    };

    statusAgg.forEach((ag) => {
      totals.all.amount += ag.amount;
      if (totals[ag._id]) {
        totals[ag._id] = { count: ag.count, amount: ag.amount };
      } else {
        totals[ag._id] = { count: ag.count, amount: ag.amount };
      }
    });

    res.status(200).json({
      driverPayrolls: driverSalaries,
      totals,
      total,
      startRange: skip + 1,
      endRange: skip + driverSalaries.length,
    });
  } catch (error) {
    res.status(500).json({
      message: "An error occurred while fetching paginated driver salaries",
      error: error.message,
    });
  }
});

// 📋 Fetch One
const fetchDriverSalary = asyncHandler(async (req, res) => {
  const doc = await DriverSalary.findOne({
    _id: req.params.id,
    tenant: req.tenant,
  })
    .populate("driverId")
    .lean();
  if (!doc) {
    return res.status(404).json({ message: "Driver Salary not found." });
  }
  res.status(200).json(doc);
});

// ✏️ Update
const updateDriverSalary = asyncHandler(async (req, res) => {
  const updated = await DriverSalary.findOneAndUpdate(
    { _id: req.params.id, tenant: req.tenant },
    req.body,
    { new: true }
  ).populate("driverId");
  if (!updated) {
    return res.status(404).json({ message: "Driver Salary not found." });
  }
  res.status(200).json(updated);
});

// 🗑️ Delete (Mark as Cancelled)
const deleteDriverSalary = asyncHandler(async (req, res) => {
  const doc = await DriverSalary.findOne({
    _id: req.params.id,
    tenant: req.tenant,
  });
  if (!doc) {
    return res.status(404).json({ message: "Driver Salary not found." });
  }

  // unlink subtrips
  await Subtrip.updateMany(
    { _id: { $in: doc.associatedSubtrips }, tenant: req.tenant },
    { $unset: { driverSalaryId: "" } }
  );

  doc.status = "cancelled";
  await doc.save();

  // Record events for each unlinked subtrip
  if (doc.associatedSubtrips && doc.associatedSubtrips.length > 0) {
    await Promise.all(
      doc.associatedSubtrips.map((stId) =>
        recordSubtripEvent(
          stId,
          SUBTRIP_EVENT_TYPES.DRIVER_SALARY_CANCELLED,
          { driverId: doc.driverId, paymentId: doc.paymentId, salaryId: doc._id },
          req.user,
          req.tenant
        )
      )
    );
  }

  res.status(200).json({ message: "Driver Salary marked as cancelled successfully." });
});

export {
  createDriverSalary,
  createBulkDriverSalaries,
  fetchDriverSalaries,
  fetchPaginatedDriverSalaries,
  fetchDriverSalary,
  updateDriverSalary,
  deleteDriverSalary,
};
