import asyncHandler from 'express-async-handler';
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
    const { vehicle, status, priority, category, fromDate, toDate, part } = req.query;
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
      const categories = Array.isArray(category) ? category : [category];
      query.category = { $in: categories };
    }

    if (fromDate || toDate) {
      query.createdAt = {};
      if (fromDate) query.createdAt.$gte = new Date(fromDate);
      if (toDate) query.createdAt.$lte = new Date(toDate);
    }

    if (part) {
      query['parts.part'] = new ObjectId(part);
    }

    const [orders, total] = await Promise.all([
      WorkOrder.find(query)
        .populate('vehicle', 'vehicleNo vehicleType')

        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      WorkOrder.countDocuments(query),
    ]);

    res.status(200).json({
      workOrders: orders,
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
    .populate('issues.assignedTo', 'name')
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
    if (workOrder.parts && workOrder.parts.length > 0) {
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
            },
            session
          );
        } catch (err) {
          // Catch insufficient stock error from utility
          await session.abortTransaction();
          session.endSession();
          return res.status(400).json({
            message: `Failed to consume part ${line.part}: ${err.message}`,
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

    const updated = await workOrder.save({ session });

    // Handle Optional Expense Creation
    if (req.body.createExpense) {
      if (!workOrder.totalCost || workOrder.totalCost <= 0) {
        // Decide if we want to block or just skip. 
        // Skipping with a warning might be better, or erroring out.
        // Let's error out to be safe if user explicitly asked for expense.
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          message: 'Cannot create expense for work order with 0 cost',
        });
      }

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

  const workOrder = await WorkOrder.findOneAndDelete({
    _id: id,
    tenant: req.tenant,
  });

  if (!workOrder) {
    return res.status(404).json({ message: 'Work order not found' });
  }

  res.status(200).json(workOrder);
});

export {
  createWorkOrder,
  fetchWorkOrders,
  fetchWorkOrderById,
  updateWorkOrder,
  closeWorkOrder,
  deleteWorkOrder,
};
