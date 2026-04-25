// controllers/loanController.js
import mongoose from 'mongoose';
import asyncHandler from 'express-async-handler';
import Loan from './loan.model.js';
import { addTenantToQuery } from '../../utils/tenant-utils.js';
import { buildSortObject } from '../../utils/query-utils.js';

/**
 * @route   GET /api/loans
 * @desc    Fetch paginated loans with filters and status aggregation
 */
const fetchPaginatedLoans = asyncHandler(async (req, res) => {
  try {
    const { driverId, transporterId, loanStatus, loanNo, loanReason, fromDate, endDate, order, orderBy } = req.query;
    const { limit, skip } = req.pagination;

    const query = addTenantToQuery(req);

    if (driverId) {
      query.borrowerType = 'Driver';
      query.borrowerId = new mongoose.Types.ObjectId(driverId);
    } else if (transporterId) {
      query.borrowerType = 'Transporter';
      query.borrowerId = new mongoose.Types.ObjectId(transporterId);
    }

    if (loanReason) {
      query.loanReason = loanReason;
    }

    if (loanStatus) {
      query.status = loanStatus;
    }

    if (loanNo) {
      query.loanNo = { $regex: loanNo, $options: 'i' };
    }

    if (fromDate || endDate) {
      query.createdAt = {};
      if (fromDate) query.createdAt.$gte = new Date(fromDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    // Build aggregation match (ObjectIds must be cast manually for aggregation)
    const aggMatch = { ...query };
    if (aggMatch.tenant) {
      aggMatch.tenant = new mongoose.Types.ObjectId(aggMatch.tenant);
    }

    const sortObj = buildSortObject(orderBy, order, { createdAt: -1 });

    const [loans, total, statusAgg] = await Promise.all([
      Loan.find(query)
        .populate('borrowerId')
        .sort(sortObj)
        .skip(skip)
        .limit(limit),
      Loan.countDocuments(query),
      Loan.aggregate([
        { $match: aggMatch },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            amount: { $sum: { $ifNull: ['$principalAmount', 0] } },
            outstanding: { $sum: { $ifNull: ['$outstandingBalance', 0] } },
          },
        },
      ]),
    ]);

    const totals = {
      all: { count: total, amount: 0, outstanding: 0 },
      active: { count: 0, amount: 0, outstanding: 0 },
      closed: { count: 0, amount: 0, outstanding: 0 },
    };

    statusAgg.forEach((ag) => {
      totals.all.amount += ag.amount;
      totals.all.outstanding += ag.outstanding;
      totals[ag._id] = { count: ag.count, amount: ag.amount, outstanding: ag.outstanding };
    });

    res.status(200).json({ loans, totals, total });
  } catch (error) {
    res.status(500).json({
      message: 'An error occurred while fetching paginated loans',
      error: error.message,
    });
  }
});

/**
 * @route   GET /api/loans/:id
 * @desc    Fetch a single loan by ID
 */
const fetchLoanById = asyncHandler(async (req, res) => {
  const loan = await Loan.findOne({
    _id: req.params.id,
    tenant: req.tenant,
  }).populate("borrowerId");
  if (!loan) {
    res.status(404);
    throw new Error("Loan not found");
  }
  res.status(200).json(loan);
});

/**
 * @route   POST /api/loans
 * @desc    Create a new loan (simple: just amount + borrower)
 */
const createLoan = asyncHandler(async (req, res) => {
  const {
    borrowerId,
    borrowerType,
    loanReason,
    principalAmount,
    disbursementDate,
    remarks,
  } = req.body;

  if (!borrowerId || !borrowerType || !principalAmount || !disbursementDate) {
    res.status(400);
    throw new Error("Missing required loan fields");
  }

  const loan = new Loan({
    borrowerId,
    borrowerType,
    loanReason,
    principalAmount,
    disbursementDate: new Date(disbursementDate),
    remarks,
    tenant: req.tenant,
  });

  await loan.save();
  res.status(201).json(loan);
});

/**
 * @route   PUT /api/loans/:id
 * @desc    Update loan remarks
 */
const updateLoan = asyncHandler(async (req, res) => {
  const loan = await Loan.findOne({ _id: req.params.id, tenant: req.tenant });
  if (!loan) {
    res.status(404);
    throw new Error("Loan not found");
  }

  if (req.body.remarks !== undefined) {
    loan.remarks = req.body.remarks;
  }
  if (req.body.loanReason !== undefined) {
    loan.loanReason = req.body.loanReason;
  }

  await loan.save();
  res.status(200).json(loan);
});

/**
 * @route   DELETE /api/loans/:id
 * @desc    Delete a loan
 */
const deleteLoan = asyncHandler(async (req, res) => {
  const loan = await Loan.findOne({ _id: req.params.id, tenant: req.tenant });
  if (!loan) {
    res.status(404);
    throw new Error("Loan not found");
  }

  await loan.deleteOne();
  res.status(200).json({ message: "Loan deleted" });
});

/**
 * @route   POST /api/loans/:id/repay
 * @desc    Record a payment against the loan
 */
const repayLoan = asyncHandler(async (req, res) => {
  const { amount, paidDate, remarks, source } = req.body;
  if (amount == null || amount <= 0) {
    res.status(400);
    throw new Error("`amount` is required and must be positive");
  }

  const loan = await Loan.findOne({ _id: req.params.id, tenant: req.tenant });
  if (!loan) {
    res.status(404);
    throw new Error("Loan not found");
  }

  const outstanding = Math.round(loan.outstandingBalance * 100) / 100;
  const payment = Math.round(amount * 100) / 100;

  if (payment > outstanding) {
    res.status(400);
    throw new Error(
      `Repayment amount (${payment.toFixed(2)}) exceeds outstanding balance (${outstanding.toFixed(2)}).`
    );
  }

  const paymentDate = paidDate ? new Date(paidDate) : new Date();

  // Record the payment
  loan.payments.push({
    paymentDate,
    amount: payment,
    source: source || "Manual",
    remarks,
  });

  // Update balance
  loan.outstandingBalance = Math.max(0, Math.round((loan.outstandingBalance - payment) * 100) / 100);

  // Close loan if fully paid
  if (loan.outstandingBalance <= 0) {
    loan.status = "closed";
  }

  await loan.save();
  res.status(200).json(loan);
});

/**
 * @route   GET /api/loans/pending/:borrowerType/:id
 * @desc    Fetch active loans for a specific borrower
 */
const fetchPendingLoans = asyncHandler(async (req, res) => {
  const { borrowerType, id } = req.params;
  if (!["Driver", "Transporter", "Employee"].includes(borrowerType)) {
    res.status(400);
    throw new Error("Invalid borrowerType");
  }
  const loans = await Loan.find({
    borrowerType,
    borrowerId: id,
    status: "active",
    tenant: req.tenant,
  }).populate("borrowerId");
  res.status(200).json(loans);
});

/**
 * @route   GET /api/loans/export
 * @desc    Export loans to excel
 */
const exportLoans = asyncHandler(async (req, res) => {
  const { driverId, transporterId, loanStatus, loanNo, loanReason, fromDate, endDate, columns, order, orderBy } = req.query;

  const query = addTenantToQuery(req);

  if (driverId) {
    query.borrowerType = 'Driver';
    query.borrowerId = new mongoose.Types.ObjectId(driverId);
  } else if (transporterId) {
    query.borrowerType = 'Transporter';
    query.borrowerId = new mongoose.Types.ObjectId(transporterId);
  }
  
  if (loanReason) query.loanReason = loanReason;
  if (loanStatus) {
    const statuses = Array.isArray(loanStatus) ? loanStatus : [loanStatus];
    query.status = { $in: statuses };
  }
  if (loanNo) query.loanNo = { $regex: loanNo, $options: 'i' };

  if (fromDate || endDate) {
    query.createdAt = {};
    if (fromDate) query.createdAt.$gte = new Date(fromDate);
    if (endDate) query.createdAt.$lte = new Date(endDate);
  }

  const aggMatch = { ...query };
  if (aggMatch.tenant) {
    aggMatch.tenant = new mongoose.Types.ObjectId(aggMatch.tenant);
  }

  const COLUMN_MAPPING = {
    loanNo: { header: 'Loan No', key: 'loanNo', width: 20 },
    borrower: { header: 'Borrower', key: 'borrowerName', width: 25 },
    borrowerType: { header: 'Type', key: 'borrowerType', width: 15 },
    loanReason: { header: 'Reason', key: 'loanReason', width: 25 },
    principalAmount: { header: 'Loan Amount', key: 'principalAmount', width: 20 },
    outstandingBalance: { header: 'Outstanding', key: 'outstandingBalance', width: 20 },
    status: { header: 'Status', key: 'status', width: 15 },
    remarks: { header: 'Remarks', key: 'remarks', width: 30 },
    createdAt: { header: 'Created', key: 'createdAt', width: 20 },
  };

  let exportColumns = [];
  if (columns) {
    const columnIds = columns.split(',');
    exportColumns = columnIds.map((id) => COLUMN_MAPPING[id]).filter((col) => col);
  }

  if (exportColumns.length === 0) {
    exportColumns = Object.values(COLUMN_MAPPING);
  }

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=Loans.xlsx');

  const ExcelJS = await import('exceljs');
  const workbook = new ExcelJS.default.stream.xlsx.WorkbookWriter({
    stream: res,
    useStyles: true,
  });

  const worksheet = workbook.addWorksheet('Loans');
  worksheet.columns = exportColumns;

  const sortObj = buildSortObject(orderBy, order, { createdAt: -1 });

  const pipeline = [
    { $match: aggMatch },
    { $sort: sortObj },
    {
      $lookup: {
        from: 'drivers',
        localField: 'borrowerId',
        foreignField: '_id',
        as: 'driverDetails'
      }
    },
    {
      $lookup: {
        from: 'transporters',
        localField: 'borrowerId',
        foreignField: '_id',
        as: 'transporterDetails'
      }
    },
    {
      $addFields: {
        driverObj: { $arrayElemAt: ['$driverDetails', 0] },
        transporterObj: { $arrayElemAt: ['$transporterDetails', 0] }
      }
    },
    {
      $project: {
        loanNo: 1,
        borrowerType: 1,
        loanReason: { $ifNull: ['$loanReason', '-'] },
        principalAmount: { $ifNull: ['$principalAmount', 0] },
        outstandingBalance: { $ifNull: ['$outstandingBalance', 0] },
        status: { $ifNull: ['$status', ''] },
        remarks: { $ifNull: ['$remarks', '-'] },
        createdAt: 1,
        borrowerName: {
          $cond: {
            if: { $eq: ['$borrowerType', 'Driver'] },
            then: '$driverObj.driverName',
            else: {
              $cond: {
                if: { $eq: ['$borrowerType', 'Transporter'] },
                then: '$transporterObj.transportName',
                else: '-'
              }
            }
          }
        }
      }
    }
  ];

  const cursor = Loan.aggregate(pipeline).cursor();

  let totalPrincipal = 0;
  let totalOutstanding = 0;

  for (let doc = await cursor.next(); doc != null; doc = await cursor.next()) {
    const row = {};

    totalPrincipal += doc.principalAmount;
    totalOutstanding += doc.outstandingBalance;

    exportColumns.forEach((col) => {
      const key = col.key;
      if (key === 'createdAt') {
        row[key] = doc[key] ? new Date(doc[key]).toISOString().split('T')[0] : '-';
      } else if (typeof doc[key] === 'number') {
        row[key] = Math.round(doc[key] * 100) / 100;
      } else {
        row[key] = doc[key] !== undefined && doc[key] !== null ? doc[key] : '-';
      }
    });

    worksheet.addRow(row).commit();
  }

  const totalRow = {};
  exportColumns.forEach((col) => {
    const key = col.key;
    if (key === 'loanNo') totalRow[key] = 'TOTAL';
    else if (key === 'principalAmount') totalRow[key] = Math.round(totalPrincipal * 100) / 100;
    else if (key === 'outstandingBalance') totalRow[key] = Math.round(totalOutstanding * 100) / 100;
    else totalRow[key] = '';
  });

  const footerRow = worksheet.addRow(totalRow);
  footerRow.font = { bold: true };
  footerRow.commit();

  worksheet.commit();
  await workbook.commit();
});

export {
  fetchPaginatedLoans,
  fetchLoanById,
  createLoan,
  updateLoan,
  deleteLoan,
  repayLoan,
  fetchPendingLoans,
  exportLoans,
};
