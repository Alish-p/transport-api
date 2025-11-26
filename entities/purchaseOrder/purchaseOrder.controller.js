import asyncHandler from 'express-async-handler';
import mongoose from 'mongoose';
import PurchaseOrder from './purchaseOrder.model.js';
import Vendor from '../vendor/vendor.model.js';
import PartLocation from '../part/partLocation.model.js';
import Part from '../part/part.model.js';
import {
  PURCHASE_ORDER_STATUS,
  PURCHASE_ORDER_DISCOUNT_TYPES,
  PURCHASE_ORDER_TAX_TYPES,
} from './purchaseOrder.constants.js';
import { addTenantToQuery } from '../../utils/tenant-utils.js';

const { ObjectId } = mongoose.Types;

function calculateTotals({
  lines,
  discountType,
  discount,
  shipping,
  taxType,
  tax,
}) {
  const safeLines = Array.isArray(lines) ? lines : [];
  const subtotal = safeLines.reduce(
    (sum, line) =>
      sum + (Number(line.quantityOrdered) || 0) * (Number(line.unitCost) || 0),
    0,
  );

  const effectiveDiscountType =
    discountType || PURCHASE_ORDER_DISCOUNT_TYPES.FIXED;
  const discountValue = Number(discount) || 0;

  let discountAmount =
    effectiveDiscountType === PURCHASE_ORDER_DISCOUNT_TYPES.PERCENTAGE
      ? (subtotal * discountValue) / 100
      : discountValue;
  if (discountAmount > subtotal) discountAmount = subtotal;

  const baseAfterDiscount = subtotal - discountAmount;

  const effectiveTaxType = taxType || PURCHASE_ORDER_TAX_TYPES.FIXED;
  const taxValue = Number(tax) || 0;

  let taxAmount =
    effectiveTaxType === PURCHASE_ORDER_TAX_TYPES.PERCENTAGE
      ? (baseAfterDiscount * taxValue) / 100
      : taxValue;
  if (taxAmount < 0) taxAmount = 0;

  const shippingValue = Number(shipping) || 0;
  const total = baseAfterDiscount + taxAmount + shippingValue;

  return {
    subtotal,
    discountAmount,
    taxAmount,
    total,
  };
}

// ─── CREATE PURCHASE ORDER ────────────────────────────────────────────────────

const createPurchaseOrder = asyncHandler(async (req, res) => {
  const {
    vendor,
    partLocation,
    description,
    lines,
    discountType,
    discount,
    shipping,
    taxType,
    tax,
  } = req.body;

  const [existingVendor, existingLocation] = await Promise.all([
    Vendor.findOne({ _id: vendor, tenant: req.tenant }),
    PartLocation.findOne({ _id: partLocation, tenant: req.tenant }),
  ]);

  if (!existingVendor) {
    return res.status(400).json({ message: 'Vendor not found for this tenant' });
  }

  if (!existingLocation) {
    return res
      .status(400)
      .json({ message: 'Part location not found for this tenant' });
  }

  const partIds = [...new Set(lines.map((l) => l.part))].map(
    (id) => new ObjectId(id),
  );

  const partsCount = await Part.countDocuments({
    _id: { $in: partIds },
    tenant: req.tenant,
  });

  if (partsCount !== partIds.length) {
    return res.status(400).json({
      message:
        'One or more parts are invalid or do not belong to this tenant',
    });
  }

  const normalizedLines = lines.map((line) => ({
    part: line.part,
    quantityOrdered: line.quantityOrdered,
    quantityReceived: line.quantityReceived ?? 0,
    unitCost: line.unitCost,
    amount: line.quantityOrdered * line.unitCost,
  }));

  const { subtotal, discountAmount, taxAmount, total } = calculateTotals({
    lines: normalizedLines,
    discountType,
    discount,
    shipping,
    taxType,
    tax,
  });

  const po = new PurchaseOrder({
    vendor,
    partLocation,
    description,
    lines: normalizedLines,
    subtotal,
    discountType:
      discountType || PURCHASE_ORDER_DISCOUNT_TYPES.FIXED,
    discount: discount ?? 0,
    shipping: shipping ?? 0,
    taxType: taxType || PURCHASE_ORDER_TAX_TYPES.FIXED,
    tax: tax ?? 0,
    discountAmount,
    taxAmount,
    total,
    status: PURCHASE_ORDER_STATUS.PENDING_APPROVAL,
    createdBy: req.user?._id,
    tenant: req.tenant,
  });

  const savedPo = await po.save();
  res.status(201).json(savedPo);
});

// ─── FETCH LIST ───────────────────────────────────────────────────────────────

const fetchPurchaseOrders = asyncHandler(async (req, res) => {
  try {
    const { vendor, status, fromDate, toDate } = req.query;
    const { limit, skip } = req.pagination;

    const query = addTenantToQuery(req);

    if (vendor) {
      const ids = Array.isArray(vendor) ? vendor : [vendor];
      query.vendor = { $in: ids.map((id) => new ObjectId(id)) };
    }

    if (status) {
      const statuses = Array.isArray(status) ? status : [status];
      query.status = { $in: statuses };
    }

    if (fromDate || toDate) {
      query.createdAt = {};
      if (fromDate) query.createdAt.$gte = new Date(fromDate);
      if (toDate) query.createdAt.$lte = new Date(toDate);
    }

    const [orders, total] = await Promise.all([
      PurchaseOrder.find(query)
        .populate('vendor', 'name phone address')
        .populate('partLocation', 'name address')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      PurchaseOrder.countDocuments(query),
    ]);

    res.status(200).json({
      purchaseOrders: orders,
      total,
      startRange: skip + 1,
      endRange: skip + orders.length,
    });
  } catch (error) {
    res.status(500).json({
      message: 'An error occurred while fetching purchase orders',
      error: error.message,
    });
  }
});

// ─── FETCH SINGLE ─────────────────────────────────────────────────────────────

const fetchPurchaseOrderById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const order = await PurchaseOrder.findOne({
    _id: id,
    tenant: req.tenant,
  })
    .populate('vendor', 'name phone address bankDetails')
    .populate('partLocation', 'name address')
    .populate('lines.part', 'partNumber name manufacturer measurementUnit');

  if (!order) {
    return res.status(404).json({ message: 'Purchase order not found' });
  }

  res.status(200).json(order);
});

// ─── UPDATE HEADER / LINES (WITH RESTRICTIONS) ───────────────────────────────

const updatePurchaseOrder = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const {
    vendor,
    partLocation,
    description,
    lines,
    discountType,
    discount,
    shipping,
    taxType,
    tax,
  } = req.body;

  const order = await PurchaseOrder.findOne({
    _id: id,
    tenant: req.tenant,
  });

  if (!order) {
    return res.status(404).json({ message: 'Purchase order not found' });
  }

  if (
    order.status === PURCHASE_ORDER_STATUS.RECEIVED ||
    order.status === PURCHASE_ORDER_STATUS.REJECTED
  ) {
    return res.status(400).json({
      message:
        'Cannot edit a purchase order that is already received or rejected',
    });
  }

  const hasAnyReceived = (order.lines || []).some(
    (line) => (line.quantityReceived || 0) > 0,
  );

  if (hasAnyReceived) {
    return res.status(400).json({
      message:
        'Cannot edit purchase order lines after items have been received',
    });
  }

  if (vendor && vendor.toString() !== order.vendor.toString()) {
    const existingVendor = await Vendor.findOne({
      _id: vendor,
      tenant: req.tenant,
    });
    if (!existingVendor) {
      return res
        .status(400)
        .json({ message: 'Vendor not found for this tenant' });
    }
    order.vendor = vendor;
  }

  if (partLocation && partLocation.toString() !== order.partLocation.toString()) {
    const existingLocation = await PartLocation.findOne({
      _id: partLocation,
      tenant: req.tenant,
    });
    if (!existingLocation) {
      return res
        .status(400)
        .json({ message: 'Part location not found for this tenant' });
    }
    order.partLocation = partLocation;
  }

  if (typeof description !== 'undefined') {
    order.description = description;
  }

  if (Array.isArray(lines) && lines.length > 0) {
    const partIds = [...new Set(lines.map((l) => l.part))].map(
      (pid) => new ObjectId(pid),
    );
    const partsCount = await Part.countDocuments({
      _id: { $in: partIds },
      tenant: req.tenant,
    });
    if (partsCount !== partIds.length) {
      return res.status(400).json({
        message:
          'One or more parts are invalid or do not belong to this tenant',
      });
    }

    order.lines = lines.map((line) => ({
      part: line.part,
      quantityOrdered: line.quantityOrdered,
      quantityReceived: line.quantityReceived ?? 0,
      unitCost: line.unitCost,
      amount: line.quantityOrdered * line.unitCost,
    }));
  }

  if (typeof discountType !== 'undefined') {
    order.discountType = discountType;
  }
  if (typeof discount !== 'undefined') {
    order.discount = discount;
  }
  if (typeof shipping !== 'undefined') {
    order.shipping = shipping;
  }
  if (typeof taxType !== 'undefined') {
    order.taxType = taxType;
  }
  if (typeof tax !== 'undefined') {
    order.tax = tax;
  }

  const { subtotal, discountAmount, taxAmount, total } = calculateTotals({
    lines: order.lines,
    discountType: order.discountType,
    discount: order.discount,
    shipping: order.shipping,
    taxType: order.taxType,
    tax: order.tax,
  });

  order.subtotal = subtotal;
  order.discountAmount = discountAmount;
  order.taxAmount = taxAmount;
  order.total = total;

  const updated = await order.save();
  res.status(200).json(updated);
});

// ─── APPROVE / REJECT ────────────────────────────────────────────────────────

const approvePurchaseOrder = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const order = await PurchaseOrder.findOne({
    _id: id,
    tenant: req.tenant,
  });

  if (!order) {
    return res.status(404).json({ message: 'Purchase order not found' });
  }

  if (order.status !== PURCHASE_ORDER_STATUS.PENDING_APPROVAL) {
    return res.status(400).json({
      message: 'Only purchase orders in pending-approval status can be approved',
    });
  }

  order.status = PURCHASE_ORDER_STATUS.APPROVED;
  order.approvedBy = req.user?._id;
  order.approvedAt = new Date();

  const updated = await order.save();
  res.status(200).json(updated);
});

const rejectPurchaseOrder = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body || {};

  const order = await PurchaseOrder.findOne({
    _id: id,
    tenant: req.tenant,
  });

  if (!order) {
    return res.status(404).json({ message: 'Purchase order not found' });
  }

  if (order.status !== PURCHASE_ORDER_STATUS.PENDING_APPROVAL) {
    return res.status(400).json({
      message: 'Only purchase orders in pending-approval status can be rejected',
    });
  }

  order.status = PURCHASE_ORDER_STATUS.REJECTED;
  order.approvedBy = req.user?._id;
  order.approvedAt = new Date();
  order.rejectionReason = reason || order.rejectionReason;

  const updated = await order.save();
  res.status(200).json(updated);
});

// ─── MARK AS PAID (PURCHASED) ────────────────────────────────────────────────

const payPurchaseOrder = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { paymentReference, paymentDate } = req.body || {};

  const order = await PurchaseOrder.findOne({
    _id: id,
    tenant: req.tenant,
  });

  if (!order) {
    return res.status(404).json({ message: 'Purchase order not found' });
  }

  if (order.status !== PURCHASE_ORDER_STATUS.APPROVED) {
    return res.status(400).json({
      message:
        'Only approved purchase orders can be marked as purchased/paid',
    });
  }

  order.status = PURCHASE_ORDER_STATUS.PURCHASED;
  order.purchasedBy = req.user?._id;
  order.purchasedAt = paymentDate ? new Date(paymentDate) : new Date();
  if (paymentReference) {
    order.paymentReference = paymentReference;
  }

  const updated = await order.save();
  res.status(200).json(updated);
});

// ─── RECEIVE ITEMS (INCREMENT STOCK) ─────────────────────────────────────────

const receivePurchaseOrder = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { lines } = req.body;

  const order = await PurchaseOrder.findOne({
    _id: id,
    tenant: req.tenant,
  });

  if (!order) {
    return res.status(404).json({ message: 'Purchase order not found' });
  }

  if (order.status === PURCHASE_ORDER_STATUS.REJECTED) {
    return res.status(400).json({
      message: 'Cannot receive items for a rejected purchase order',
    });
  }

  if (
    ![
      PURCHASE_ORDER_STATUS.APPROVED,
      PURCHASE_ORDER_STATUS.PURCHASED,
    ].includes(order.status)
  ) {
    return res.status(400).json({
      message:
        'Only approved or purchased purchase orders can be received',
    });
  }

  const updatesMap = new Map();
  lines.forEach((line) => {
    updatesMap.set(line.lineId, line.quantityReceived);
  });

  const invalidLineIds = [];
  const partIncrements = [];

  order.lines.forEach((line) => {
    const lineIdStr = line._id.toString();
    if (!updatesMap.has(lineIdStr)) return;

    const newReceived = updatesMap.get(lineIdStr);
    const currentReceived = line.quantityReceived || 0;
    const maxQty = line.quantityOrdered || 0;

    if (newReceived < currentReceived || newReceived > maxQty) {
      invalidLineIds.push(lineIdStr);
      return;
    }

    const delta = newReceived - currentReceived;
    if (delta > 0) {
      line.quantityReceived = newReceived;
      partIncrements.push({
        partId: line.part,
        delta,
      });
    }
  });

  if (invalidLineIds.length > 0) {
    return res.status(400).json({
      message:
        'Invalid quantity updates: cannot decrease received quantity or exceed ordered quantity',
      invalidLines: invalidLineIds,
    });
  }

  if (!partIncrements.length) {
    return res.status(400).json({
      message: 'No quantity changes detected for this purchase order',
    });
  }

  await Promise.all(
    partIncrements.map((u) =>
      Part.updateOne(
        { _id: u.partId, tenant: req.tenant },
        { $inc: { quantity: u.delta } },
      ),
    ),
  );

  const allFullyReceived = order.lines.every(
    (line) =>
      (line.quantityReceived || 0) >= (line.quantityOrdered || 0),
  );

  if (allFullyReceived) {
    order.status = PURCHASE_ORDER_STATUS.RECEIVED;
    order.receivedAt = new Date();
  }

  const updated = await order.save();
  res.status(200).json(updated);
});

export {
  createPurchaseOrder,
  fetchPurchaseOrders,
  fetchPurchaseOrderById,
  updatePurchaseOrder,
  approvePurchaseOrder,
  rejectPurchaseOrder,
  payPurchaseOrder,
  receivePurchaseOrder,
};
