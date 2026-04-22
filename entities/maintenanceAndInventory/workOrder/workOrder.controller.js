import asyncHandler from 'express-async-handler';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import mongoose from 'mongoose';
import WorkOrder from './workOrder.model.js';
import Part from '../part/part.model.js';
import Expense from '../../expense/expense.model.js';
import { addTenantToQuery } from '../../../utils/tenant-utils.js';
import { WORK_ORDER_STATUS } from './workOrder.constants.js';
import { recordInventoryActivity } from '../partTransaction/partTransaction.utils.js';
import {
  INVENTORY_ACTIVITY_TYPES,
  SOURCE_DOCUMENT_TYPES,
} from '../partTransaction/partTransaction.constants.js';
import { DEFAULT_TIMEZONE } from '../../../utils/time-utils.js';

dayjs.extend(utc);
dayjs.extend(timezone);

const { ObjectId } = mongoose.Types;

function calculateCosts({ parts, labourCharge }) {
  const safeParts = Array.isArray(parts) ? parts : [];
  const partsCost = safeParts.reduce(
    (sum, line) => sum + (Number(line.quantity) || 0) * (Number(line.price) || 0),
    0,
  );
  const labour = Number(labourCharge) || 0;
  const totalCost = partsCost + labour;
  return { partsCost, totalCost };
}

// ─── CREATE WORK ORDER ───────────────────────────────────────────────────────

const createWorkOrder = asyncHandler(async (req, res) => {
  const {
    vehicle,
    status,
    priority,
    scheduledStartDate,
    actualStartDate,
    completedDate,

    odometerReading,
    issues,
    labourCharge,
    parts,
    description,
    category,
  } = req.body;

  const partIds = (Array.isArray(parts) ? parts : [])
    .filter(p => p.part)
    .map(p => new ObjectId(p.part));

  const fetchedParts = await Part.find({
    _id: { $in: partIds },
    tenant: req.tenant,
  });

  const partMap = fetchedParts.reduce((acc, part) => {
    acc[part._id.toString()] = part;
    return acc;
  }, {});

  const normalizedParts = (Array.isArray(parts) ? parts : []).map((line) => {
    const partId = line.part ? line.part.toString() : null;
    const part = partId ? partMap[partId] : null;

    let partSnapshot;

    if (part) {
      partSnapshot = {
        partNumber: part.partNumber,
        name: part.name,
        measurementUnit: part.measurementUnit,
        manufacturer: part.manufacturer,
        category: part.category,
      };
    } else {
      // For adhoc parts, use provided info or defaults
      partSnapshot = {
        name: line.name || 'Custom Item',
        // Optional: you could allow user to provide unit for adhoc parts too, 
        // but for now relying on what's available
      };
    }

    return {
      part: line.part ? new ObjectId(line.part) : undefined,
      partLocation: line.partLocation ? new ObjectId(line.partLocation) : undefined,
      name: line.name, // Ensure name is saved for adhoc parts
      quantity: line.quantity,
      price: line.price,
      amount: line.quantity * line.price,
      partSnapshot,
    };
  });

  const { partsCost, totalCost } = calculateCosts({
    parts: normalizedParts,
    labourCharge,
  });

  const workOrder = new WorkOrder({
    vehicle,
    status: status || WORK_ORDER_STATUS.OPEN,
    priority,
    scheduledStartDate,
    actualStartDate,
    completedDate,

    odometerReading,
    issues,
    labourCharge: labourCharge ?? 0,
    parts: normalizedParts,
    partsCost,
    totalCost,

    description,
    category,
    createdBy: req.user?._id,
    tenant: req.tenant,
  });

  const saved = await workOrder.save();
  res.status(201).json(saved);
});

// ─── FETCH LIST ───────────────────────────────────────────────────────────────

const fetchWorkOrders = asyncHandler(async (req, res) => {
  try {
    const { vehicle, status, priority, category, fromDate, toDate, part, createdBy, closedBy, issueAssignee, issue, expenseAdded, startDate, endDate } = req.query;
    const { limit, skip } = req.pagination;

    const query = addTenantToQuery(req);

    if (vehicle) {
      const ids = Array.isArray(vehicle) ? vehicle : [vehicle];
      query.vehicle = { $in: ids.map((id) => new ObjectId(id)) };
    }

    if (status) {
      const statuses = Array.isArray(status) ? status : [status];
      query.status = { $in: statuses };
    }

    if (priority) {
      const priorities = Array.isArray(priority) ? priority : [priority];
      query.priority = { $in: priorities };
    }

    if (category) {
      if (Array.isArray(category)) {
        query.category = { $in: category.map(c => new RegExp(c, 'i')) };
      } else {
        query.category = { $regex: new RegExp(category, 'i') };
      }
    }

    if (fromDate || toDate) {
      query.createdAt = {};
      if (fromDate) query.createdAt.$gte = new Date(fromDate);
      if (toDate) query.createdAt.$lte = new Date(toDate);
    }

    if (startDate) {
      const start = dayjs.tz(`${startDate}`, DEFAULT_TIMEZONE).startOf('day').toDate();
      const end = dayjs.tz(`${startDate}`, DEFAULT_TIMEZONE).add(1, 'day').startOf('day').toDate();
      query.actualStartDate = { $gte: start, $lt: end };
    }

    if (endDate) {
      const start = dayjs.tz(`${endDate}`, DEFAULT_TIMEZONE).startOf('day').toDate();
      const end = dayjs.tz(`${endDate}`, DEFAULT_TIMEZONE).add(1, 'day').startOf('day').toDate();
      query.completedDate = { $gte: start, $lt: end };
    }

    if (part) {
      query['parts.part'] = new ObjectId(part);
    }

    if (createdBy) {
      query.createdBy = new ObjectId(createdBy);
    }

    if (closedBy) {
      query.closedBy = new ObjectId(closedBy);
    }

    if (issueAssignee) {
      query['issues.assignedTo'] = new ObjectId(issueAssignee);
    }

    if (issue) {
      if (Array.isArray(issue)) {
        query['issues.issue'] = { $in: issue.map(i => new RegExp(i, 'i')) };
      } else {
        query['issues.issue'] = { $regex: new RegExp(issue, 'i') };
      }
    }

    if (expenseAdded !== undefined && expenseAdded !== '') {
      query.expenseAdded = expenseAdded === 'true';
    }

    const aggMatch = { ...query };
    if (aggMatch.tenant && typeof aggMatch.tenant === 'string') {
      aggMatch.tenant = new ObjectId(aggMatch.tenant);
    }

    const [orders, total, statusAgg] = await Promise.all([
      WorkOrder.find(query)
        .populate('vehicle', 'vehicleNo vehicleType')
        .populate('createdBy closedBy', 'name')
        .populate('issues.assignedTo', 'name customerName')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      WorkOrder.countDocuments(query),
      WorkOrder.aggregate([
        { $match: aggMatch },
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

    const totals = {
      all: { count: total },
      open: { count: 0 },
      pending: { count: 0 },
      completed: { count: 0 },
    };

    statusAgg.forEach((ag) => {
      if (ag._id) {
        totals[ag._id] = { count: ag.count };
      }
    });

    res.status(200).json({
      workOrders: orders,
      totals,
      total,
      startRange: skip + 1,
      endRange: skip + orders.length,
    });
  } catch (error) {
    res.status(500).json({
      message: 'An error occurred while fetching work orders',
      error: error.message,
    });
  }
});

// ─── FETCH SINGLE ─────────────────────────────────────────────────────────────

const fetchWorkOrderById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const workOrder = await WorkOrder.findOne({
    _id: id,
    tenant: req.tenant,
  })
    .populate('vehicle', 'vehicleNo vehicleType')
    .populate('issues.assignedTo', 'name customerName')
    .populate('createdBy', 'name')
    .populate('closedBy', 'name')
    .populate('parts.part', 'partNumber name manufacturer measurementUnit')
    .populate('parts.partLocation', 'name address');

  if (!workOrder) {
    return res.status(404).json({ message: 'Work order not found' });
  }

  res.status(200).json(workOrder);
});

// ─── UPDATE WORK ORDER ────────────────────────────────────────────────────────

const updateWorkOrder = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const {
    vehicle,
    status,
    priority,
    scheduledStartDate,
    actualStartDate,
    completedDate,

    odometerReading,
    issues,
    labourCharge,
    parts,
    description,
    category,
  } = req.body;

  const workOrder = await WorkOrder.findOne({
    _id: id,
    tenant: req.tenant,
  });

  if (!workOrder) {
    return res.status(404).json({ message: 'Work order not found' });
  }

  if (vehicle) workOrder.vehicle = vehicle;
  if (status) workOrder.status = status;
  if (priority) workOrder.priority = priority;
  if (typeof scheduledStartDate !== 'undefined') {
    workOrder.scheduledStartDate = scheduledStartDate;
  }
  if (typeof actualStartDate !== 'undefined') {
    workOrder.actualStartDate = actualStartDate;
  }
  if (typeof completedDate !== 'undefined') {
    workOrder.completedDate = completedDate;
  }

  if (typeof odometerReading !== 'undefined') {
    workOrder.odometerReading = odometerReading;
  }
  if (typeof issues !== 'undefined') {
    workOrder.issues = issues;
  }
  if (typeof labourCharge !== 'undefined') {
    workOrder.labourCharge = labourCharge;
  }
  if (Array.isArray(parts)) {
    const partIds = parts
      .filter(p => p.part)
      .map(p => new ObjectId(p.part));

    const fetchedParts = await Part.find({
      _id: { $in: partIds },
      tenant: req.tenant,
    });

    const partMap = fetchedParts.reduce((acc, part) => {
      acc[part._id.toString()] = part;
      return acc;
    }, {});

    const normalizedParts = parts.map((line) => {
      const partId = line.part ? line.part.toString() : null;
      const part = partId ? partMap[partId] : null;

      let partSnapshot;

      if (part) {
        partSnapshot = {
          partNumber: part.partNumber,
          name: part.name,
          measurementUnit: part.measurementUnit,
          manufacturer: part.manufacturer,
          category: part.category,
        };
      } else {
        partSnapshot = {
          name: line.name || 'Custom Item',
        };
      }

      return {
        part: line.part ? new ObjectId(line.part) : undefined,
        partLocation: line.partLocation ? new ObjectId(line.partLocation) : undefined,
        name: line.name,
        quantity: line.quantity,
        price: line.price,
        amount: line.quantity * line.price,
        partSnapshot,
      };
    });
    workOrder.parts = normalizedParts;
  }
  if (typeof description !== 'undefined') {
    workOrder.description = description;
  }
  if (typeof category !== 'undefined') {
    workOrder.category = category;
  }

  const { partsCost, totalCost } = calculateCosts({
    parts: workOrder.parts,
    labourCharge: workOrder.labourCharge,
  });

  workOrder.partsCost = partsCost;
  workOrder.totalCost = totalCost;

  const updated = await workOrder.save();
  res.status(200).json(updated);
});

// ─── CLOSE WORK ORDER ────────────────────────────────────────────────────────

const closeWorkOrder = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const workOrder = await WorkOrder.findOne({
      _id: id,
      tenant: req.tenant,
    }).session(session);

    if (!workOrder) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: 'Work order not found' });
    }

    if (workOrder.status === WORK_ORDER_STATUS.COMPLETED) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(400)
        .json({ message: 'Work order is already completed' });
    }

    // Process parts consumption
    if (workOrder.category !== 'External Workshop' && workOrder.parts && workOrder.parts.length > 0) {
      for (const line of workOrder.parts) {
        if (!line.part) continue; // Skip non-part items (adhoc/provision)

        if (!line.partLocation) {
          await session.abortTransaction();
          session.endSession();
          return res.status(400).json({
            message: `Part location is missing for part ${line.part} in work order line`,
          });
        }

        // Consume stock
        // recordInventoryActivity handles the check and decrement
        try {
          await recordInventoryActivity(
            {
              tenant: req.tenant,
              partId: line.part,
              locationId: line.partLocation,
              type: INVENTORY_ACTIVITY_TYPES.WORK_ORDER_ISSUE,
              direction: 'OUT',
              quantityChange: -Math.abs(line.quantity), // Ensure negative
              performedBy: req.user._id,
              sourceDocumentType: SOURCE_DOCUMENT_TYPES.WORK_ORDER,
              sourceDocumentId: workOrder._id,
              sourceDocumentLineId: line._id,
              reason: 'Work Order Consumption',
              meta: { sourceDocumentNumber: workOrder.workOrderNo },
            },
            session
          );
        } catch (err) {
          // Catch insufficient stock error from utility
          await session.abortTransaction();
          session.endSession();

          const partIdentifier = line.partSnapshot?.name || line.name || line.part;
          return res.status(400).json({
            message: `Failed to consume part ${partIdentifier}: ${err.message}`,
          });
        }
      }
    }

    workOrder.status = WORK_ORDER_STATUS.COMPLETED;
    workOrder.completedDate = workOrder.completedDate || new Date();
    workOrder.closedBy = req.user?._id;

    const { partsCost, totalCost } = calculateCosts({
      parts: workOrder.parts,
      labourCharge: workOrder.labourCharge,
    });
    workOrder.partsCost = partsCost;
    workOrder.totalCost = totalCost;

    // Make sure we validate cost BEFORE proceeding if they want to create an expense
    if (req.body.createExpense && (!totalCost || totalCost <= 0)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        message: 'Cannot create expense for work order with 0 total cost.',
      });
    }

    if (req.body.createExpense) {
      workOrder.expenseAdded = true;
    }

    const updated = await workOrder.save({ session });

    // Handle Optional Expense Creation
    if (req.body.createExpense) {
    // Validation is done earlier now
      const expense = new Expense({
        vehicleId: workOrder.vehicle,
        date: workOrder.completedDate || new Date(),
        expenseCategory: 'vehicle',
        expenseType: 'Work Order', // You might want to make this a constant or configurable
        amount: workOrder.totalCost,
        remarks: `Created from Work Order #${workOrder.workOrderNo || workOrder._id}`,
        tenant: req.tenant,
        // Optional: link back to work order if Expense model supported it, 
        // but currently it doesn't seem to have workOrderId field. 
        // Remarks is a good fallback.
      });

      await expense.save({ session });
    }

    await session.commitTransaction();
    session.endSession();

    res.status(200).json(updated);
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    res.status(500).json({
      message: 'An error occurred while closing work order',
      error: error.message,
    });
  }
});

// ─── DELETE WORK ORDER ────────────────────────────────────────────────────────

const deleteWorkOrder = asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Explicit status check — completed WOs are permanent maintenance records
  const existing = await WorkOrder.findOne({ _id: id, tenant: req.tenant });

  if (!existing) {
    return res.status(404).json({ message: 'Work order not found' });
  }

  if (existing.status === WORK_ORDER_STATUS.COMPLETED) {
    res.status(400);
    throw new Error(
      'Completed work orders cannot be deleted as they are permanent maintenance records.'
    );
  }

  // OPEN and PENDING WOs have no inventory transactions (parts are only
  // consumed when closeWorkOrder is called), so safe to hard delete.
  await WorkOrder.findOneAndDelete({ _id: id, tenant: req.tenant });

  res.status(200).json({ message: 'Work order deleted successfully', id: existing._id });
});

// @desc    Export work orders to Excel
// @route   GET /api/maintenance/work-orders/export
// @access  Private
const exportWorkOrders = asyncHandler(async (req, res) => {
  const { vehicle, status, priority, category, fromDate, toDate, part, createdBy, closedBy, issueAssignee, issue, columns, expenseAdded, startDate, endDate } = req.query;

  const query = addTenantToQuery(req);

  if (vehicle) {
    const ids = Array.isArray(vehicle) ? vehicle : [vehicle];
    query.vehicle = { $in: ids.map((id) => new ObjectId(id)) };
  }

  if (status) {
    const statuses = Array.isArray(status) ? status : [status];
    query.status = { $in: statuses };
  }

  if (priority) {
    const priorities = Array.isArray(priority) ? priority : [priority];
    query.priority = { $in: priorities };
  }

  if (category) {
    if (Array.isArray(category)) {
      query.category = { $in: category.map(c => new RegExp(c, 'i')) };
    } else {
      query.category = { $regex: new RegExp(category, 'i') };
    }
  }

  if (fromDate || toDate) {
    query.createdAt = {};
    if (fromDate) query.createdAt.$gte = new Date(fromDate);
    if (toDate) query.createdAt.$lte = new Date(toDate);
  }

  if (startDate) {
    const start = dayjs.tz(`${startDate}`, DEFAULT_TIMEZONE).startOf('day').toDate();
    const end = dayjs.tz(`${startDate}`, DEFAULT_TIMEZONE).add(1, 'day').startOf('day').toDate();
    query.actualStartDate = { $gte: start, $lt: end };
  }

  if (endDate) {
    const start = dayjs.tz(`${endDate}`, DEFAULT_TIMEZONE).startOf('day').toDate();
    const end = dayjs.tz(`${endDate}`, DEFAULT_TIMEZONE).add(1, 'day').startOf('day').toDate();
    query.completedDate = { $gte: start, $lt: end };
  }

  if (part) {
    query['parts.part'] = new ObjectId(part);
  }

  if (createdBy) {
    query.createdBy = new ObjectId(createdBy);
  }

  if (closedBy) {
    query.closedBy = new ObjectId(closedBy);
  }

  if (issueAssignee) {
    query['issues.assignedTo'] = new ObjectId(issueAssignee);
  }

  if (issue) {
    if (Array.isArray(issue)) {
      query['issues.issue'] = { $in: issue.map(i => new RegExp(i, 'i')) };
    } else {
      query['issues.issue'] = { $regex: new RegExp(issue, 'i') };
    }
  }

  if (expenseAdded !== undefined && expenseAdded !== '') {
    query.expenseAdded = expenseAdded === 'true';
  }

  const orders = await WorkOrder.find(query)
    .populate('vehicle', 'vehicleNo')
    .populate('issues.assignedTo', 'name customerName')
    .populate('createdBy closedBy', 'name')
    .sort({ createdAt: -1 })
    .lean();

  const COLUMN_MAPPING = {
    workOrderNo: { header: 'WO No.', key: 'workOrderNo', width: 15 },
    vehicle: { header: 'Vehicle', key: 'vehicle', width: 20 },
    status: { header: 'Status', key: 'status', width: 15 },
    priority: { header: 'Priority', key: 'priority', width: 15 },
    category: { header: 'Category', key: 'category', width: 15 },
    timeTaken: { header: 'Time Taken', key: 'timeTaken', width: 25 },
    issues: { header: 'Issues', key: 'issues', width: 30 },
    issueAssignees: { header: 'Issue Assignees', key: 'issueAssignees', width: 25 },
    scheduledStartDate: { header: 'Scheduled Start', key: 'scheduledStartDate', width: 15 },
    completedDate: { header: 'Completed On', key: 'completedDate', width: 15 },
    expenseAdded: { header: 'Expense Added', key: 'expenseAdded', width: 15 },
    totalCost: { header: 'Total Cost', key: 'totalCost', width: 15 },
  };

  let exportColumns = [];
  if (columns) {
    const columnIds = columns.split(',');
    exportColumns = columnIds
      .map((id) => COLUMN_MAPPING[id])
      .filter((col) => col);
  }

  if (exportColumns.length === 0) {
    exportColumns = Object.values(COLUMN_MAPPING);
  }

  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  res.setHeader(
    "Content-Disposition",
    "attachment; filename=WorkOrders.xlsx"
  );

  const ExcelJS = await import('exceljs');
  const workbook = new ExcelJS.default.stream.xlsx.WorkbookWriter({
    stream: res,
    useStyles: true,
  });

  const worksheet = workbook.addWorksheet('Work Orders');
  worksheet.columns = exportColumns;

  let grandTotalCost = 0;

  for (const rowData of orders) {
    const row = {};
    grandTotalCost += rowData.totalCost || 0;

    exportColumns.forEach((col) => {
      const key = col.key;
      if (key === 'vehicle') {
        row[key] = rowData.vehicle?.vehicleNo || '-';
      } else if (key === 'timeTaken') {
        if (rowData.actualStartDate && rowData.completedDate) {
          const ms = new Date(rowData.completedDate).getTime() - new Date(rowData.actualStartDate).getTime();
          const hrs = Math.floor(ms / (1000 * 60 * 60));
          const mins = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
          row[key] = `${hrs}hr ${mins}m`;
        } else {
          row[key] = '-';
        }
      } else if (key === 'issues') {
        const issuesList = rowData.issues || [];
        const vals = issuesList.map((i) => typeof i?.issue === 'object' ? i.issue.value : i?.issue).filter(Boolean);
        row[key] = vals.join(', ') || '-';
      } else if (key === 'issueAssignees') {
        const issues = rowData.issues || [];
        const names = issues.flatMap((issue) => {
          if (!issue || typeof issue !== 'object' || !Array.isArray(issue.assignedTo)) return [];
          return issue.assignedTo.map(user => {
            if (!user) return null;
            return user.name || user.customerName || null;
          }).filter(Boolean);
        });
        const unique = Array.from(new Set(names));
        row[key] = unique.join(', ') || '-';
      } else if (key === 'scheduledStartDate' || key === 'completedDate') {
        const dateStr = rowData[key] ? new Date(rowData[key]).toLocaleDateString() : '-';
        row[key] = dateStr;
      } else if (key === 'expenseAdded') {
        row[key] = rowData[key] ? 'Yes' : 'No';
      } else {
        row[key] = (rowData[key] !== undefined && rowData[key] !== null) ? rowData[key] : '-';
      }
    });

    worksheet.addRow(row).commit();
  }

  // Footer Row
  const totalRow = {};
  exportColumns.forEach((col) => {
    const key = col.key;
    if (key === 'workOrderNo') totalRow[key] = 'TOTAL';
    else if (key === 'totalCost') totalRow[key] = Math.round(grandTotalCost * 100) / 100;
    else totalRow[key] = '';
  });

  const footerRow = worksheet.addRow(totalRow);
  footerRow.font = { bold: true };
  footerRow.commit();

  worksheet.commit();
  await workbook.commit();
});

// ─── ADD WORK ORDER EXPENSE ──────────────────────────────────────────────────

const addWorkOrderExpense = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const workOrder = await WorkOrder.findOne({
      _id: id,
      tenant: req.tenant,
    }).session(session);

    if (!workOrder) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: 'Work order not found' });
    }

    if (workOrder.status !== WORK_ORDER_STATUS.COMPLETED) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: 'Can only add expense to completed work orders' });
    }

    if (workOrder.expenseAdded) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: 'Expense already added for this work order' });
    }

    if (!workOrder.totalCost || workOrder.totalCost <= 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: 'Cannot create expense for work order with 0 cost' });
    }

    const expense = new Expense({
      vehicleId: workOrder.vehicle,
      date: workOrder.completedDate || new Date(),
      expenseCategory: 'vehicle',
      expenseType: 'Work Order',
      amount: workOrder.totalCost,
      remarks: `Created from Work Order #${workOrder.workOrderNo || workOrder._id}`,
      tenant: req.tenant,
    });

    await expense.save({ session });

    workOrder.expenseAdded = true;
    const updated = await workOrder.save({ session });

    await session.commitTransaction();
    session.endSession();

    res.status(200).json(updated);
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    res.status(500).json({
      message: 'An error occurred while adding work order expense',
      error: error.message,
    });
  }
});

export {
  createWorkOrder,
  fetchWorkOrders,
  fetchWorkOrderById,
  updateWorkOrder,
  closeWorkOrder,
  exportWorkOrders,
  deleteWorkOrder,
  addWorkOrderExpense,
};
