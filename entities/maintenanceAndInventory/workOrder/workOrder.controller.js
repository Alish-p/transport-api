import asyncHandler from 'express-async-handler';
import mongoose from 'mongoose';
import WorkOrder from './workOrder.model.js';
import Part from '../part/part.model.js';
import { addTenantToQuery } from '../../../utils/tenant-utils.js';
import { WORK_ORDER_STATUS } from './workOrder.constants.js';

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
    assignedTo,
    odometerReading,
    issues,
    labourCharge,
    parts,
    description,
  } = req.body;

  const normalizedParts = (Array.isArray(parts) ? parts : []).map((line) => ({
    part: line.part ? new ObjectId(line.part) : undefined,
    partLocation: line.partLocation ? new ObjectId(line.partLocation) : undefined,
    quantity: line.quantity,
    price: line.price,
    amount: line.quantity * line.price,
  }));

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
    assignedTo,
    odometerReading,
    issues,
    labourCharge: labourCharge ?? 0,
    parts: normalizedParts,
    partsCost,
    totalCost,
    description,
    createdBy: req.user?._id,
    tenant: req.tenant,
  });

  const saved = await workOrder.save();
  res.status(201).json(saved);
});

// ─── FETCH LIST ───────────────────────────────────────────────────────────────

const fetchWorkOrders = asyncHandler(async (req, res) => {
  try {
    const { vehicle, status, priority, fromDate, toDate, part } = req.query;
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
        .populate('assignedTo', 'name')
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
    .populate('assignedTo', 'name')
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
    assignedTo,
    odometerReading,
    issues,
    labourCharge,
    parts,
    description,
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
  if (typeof assignedTo !== 'undefined') {
    workOrder.assignedTo = assignedTo;
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
    const normalizedParts = parts.map((line) => ({
      part: line.part ? new ObjectId(line.part) : undefined,
      partLocation: line.partLocation ? new ObjectId(line.partLocation) : undefined,
      quantity: line.quantity,
      price: line.price,
      amount: line.quantity * line.price,
    }));
    workOrder.parts = normalizedParts;
  }
  if (typeof description !== 'undefined') {
    workOrder.description = description;
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

  const workOrder = await WorkOrder.findOne({
    _id: id,
    tenant: req.tenant,
  });

  if (!workOrder) {
    return res.status(404).json({ message: 'Work order not found' });
  }

  if (workOrder.status === WORK_ORDER_STATUS.COMPLETED) {
    return res
      .status(400)
      .json({ message: 'Work order is already completed' });
  }

  // Aggregate total consumption per part for inventory-managed items
  const consumptionByPart = new Map();
  (workOrder.parts || []).forEach((line) => {
    if (!line.part) return;
    const key = line.part.toString();
    const current = consumptionByPart.get(key) || 0;
    consumptionByPart.set(key, current + (line.quantity || 0));
  });

  const partIds = Array.from(consumptionByPart.keys()).map((id) => new ObjectId(id));

  if (partIds.length > 0) {
    const parts = await Part.find({
      _id: { $in: partIds },
      tenant: req.tenant,
    });

    if (parts.length !== partIds.length) {
      return res.status(400).json({
        message:
          'One or more parts referenced in this work order are missing for this tenant',
      });
    }

    // Validate stock
    const insufficient = [];
    parts.forEach((p) => {
      const required = consumptionByPart.get(p._id.toString()) || 0;
      if ((p.quantity || 0) < required) {
        insufficient.push({
          partId: p._id.toString(),
          available: p.quantity || 0,
          required,
        });
      }
    });

    if (insufficient.length > 0) {
      return res.status(400).json({
        message:
          'Insufficient stock for one or more parts to close this work order',
        insufficient,
      });
    }

    // Apply stock decrements
    await Promise.all(
      parts.map((p) => {
        const required = consumptionByPart.get(p._id.toString()) || 0;
        if (!required) return null;
        return Part.updateOne(
          { _id: p._id, tenant: req.tenant },
          { $inc: { quantity: -required } },
        );
      }),
    );
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

  const updated = await workOrder.save();
  res.status(200).json(updated);
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
