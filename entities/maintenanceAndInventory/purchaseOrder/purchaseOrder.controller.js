import asyncHandler from 'express-async-handler';
import mongoose from 'mongoose';
import PurchaseOrder from './purchaseOrder.model.js';
import Vendor from '../vendor/vendor.model.js';
import PartLocation from '../partLocation/partLocation.model.js';
import PartStock from '../partStock/partStock.model.js';
import Part from '../part/part.model.js';
import {
  PURCHASE_ORDER_STATUS,
  PURCHASE_ORDER_DISCOUNT_TYPES,
  PURCHASE_ORDER_TAX_TYPES,
} from './purchaseOrder.constants.js';
import { addTenantToQuery } from '../../../utils/tenant-utils.js';
import { recordInventoryActivity } from '../partTransaction/partTransaction.utils.js';
import {
  INVENTORY_ACTIVITY_TYPES,
  SOURCE_DOCUMENT_TYPES,
} from '../partTransaction/partTransaction.constants.js';

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

  const parts = await Part.find({
    _id: { $in: partIds },
    tenant: req.tenant,
  });

  if (parts.length !== partIds.length) {
    return res.status(400).json({
      message:
        'One or more parts are invalid or do not belong to this tenant',
    });
  }

  const partMap = parts.reduce((acc, part) => {
    acc[part._id.toString()] = part;
    return acc;
  }, {});

  const normalizedLines = lines.map((line) => {
    const part = partMap[line.part.toString()];
    return {
      part: line.part,
      quantityOrdered: line.quantityOrdered,
      quantityReceived: line.quantityReceived ?? 0,
      unitCost: line.unitCost,
      amount: line.quantityOrdered * line.unitCost,
      partSnapshot: {
        partNumber: part.partNumber,
        name: part.name,
        measurementUnit: part.measurementUnit,
        manufacturer: part.manufacturer,
        category: part.category,
      },
    };
  });

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
    vendorSnapshot: {
      name: existingVendor.name,
      phone: existingVendor.phone,
      address: existingVendor.address,
      bankDetails: existingVendor.bankDetails,
    },
    partLocation,
    partLocationSnapshot: {
      name: existingLocation.name,
      address: existingLocation.address,
    },
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

  po._user = req.user;
  const savedPo = await po.save();
  res.status(201).json(savedPo);
});

// ─── FETCH LIST ───────────────────────────────────────────────────────────────

const fetchPurchaseOrders = asyncHandler(async (req, res) => {
  try {
    const { vendor, status, fromDate, toDate, part, partLocation } = req.query;
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

    if (part) {
      query['lines.part'] = new ObjectId(part);
    }

    if (partLocation) {
      query.partLocation = new ObjectId(partLocation);
    }

    const aggQuery = { ...query };

    const [orders, totalsAgg] = await Promise.all([
      PurchaseOrder.find(query)
        .populate('vendor', 'name phone address')
        .populate('partLocation', 'name address')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      PurchaseOrder.aggregate([
        { $match: aggQuery },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            amount: { $sum: '$total' },
          },
        },
      ]),
    ]);

    const totals = {
      all: { count: 0, amount: 0 },
      pendingApproval: { count: 0, amount: 0 },
      approved: { count: 0, amount: 0 },
      purchased: { count: 0, amount: 0 },
      rejected: { count: 0, amount: 0 },
      received: { count: 0, amount: 0 },
      partialReceived: { count: 0, amount: 0 },
    };

    const statusMap = {
      [PURCHASE_ORDER_STATUS.PENDING_APPROVAL]: 'pendingApproval',
      [PURCHASE_ORDER_STATUS.APPROVED]: 'approved',
      [PURCHASE_ORDER_STATUS.PURCHASED]: 'purchased',
      [PURCHASE_ORDER_STATUS.REJECTED]: 'rejected',
      [PURCHASE_ORDER_STATUS.RECEIVED]: 'received',
      [PURCHASE_ORDER_STATUS.PARTIAL_RECEIVED]: 'partialReceived',
    };

    totalsAgg.forEach((t) => {
      const key = statusMap[t._id];
      if (key) {
        totals[key] = { count: t.count, amount: t.amount };
      }
      totals.all.count += t.count;
      totals.all.amount += t.amount;
    });

    res.status(200).json({
      purchaseOrders: orders,
      totals,
      total: totals.all.count,
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
    order.vendorSnapshot = {
      name: existingVendor.name,
      phone: existingVendor.phone,
      address: existingVendor.address,
      bankDetails: existingVendor.bankDetails,
    };
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
    order.partLocationSnapshot = {
      name: existingLocation.name,
      address: existingLocation.address,
    };
  }

  if (typeof description !== 'undefined') {
    order.description = description;
  }

  if (Array.isArray(lines) && lines.length > 0) {
    const partIds = [...new Set(lines.map((l) => l.part))].map(
      (pid) => new ObjectId(pid),
    );
    const parts = await Part.find({
      _id: { $in: partIds },
      tenant: req.tenant,
    });
    if (parts.length !== partIds.length) {
      return res.status(400).json({
        message:
          'One or more parts are invalid or do not belong to this tenant',
      });
    }

    const partMap = parts.reduce((acc, part) => {
      acc[part._id.toString()] = part;
      return acc;
    }, {});

    order.lines = lines.map((line) => {
      const part = partMap[line.part.toString()];
      const newLine = {
        part: line.part,
        quantityOrdered: line.quantityOrdered,
        quantityReceived: line.quantityReceived ?? 0,
        unitCost: line.unitCost,
        amount: line.quantityOrdered * line.unitCost,
        partSnapshot: {
          partNumber: part.partNumber,
          name: part.name,
          measurementUnit: part.measurementUnit,
          manufacturer: part.manufacturer,
          category: part.category,
        },
      };
      if (line._id) newLine._id = line._id;
      return newLine;
    });
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

  order._user = req.user;
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

  order._user = req.user;
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

  order._user = req.user;
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

  order._user = req.user;
  const updated = await order.save();
  res.status(200).json(updated);
});

// ─── RECEIVE ITEMS (INCREMENT STOCK) ─────────────────────────────────────────

const receivePurchaseOrder = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { lines } = req.body;

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const order = await PurchaseOrder.findOne({
      _id: id,
      tenant: req.tenant,
    }).session(session);

    if (!order) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: 'Purchase order not found' });
    }

    if (order.status === PURCHASE_ORDER_STATUS.REJECTED) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        message: 'Cannot receive items for a rejected purchase order',
      });
    }

    if (
      ![
        PURCHASE_ORDER_STATUS.APPROVED,
        PURCHASE_ORDER_STATUS.PURCHASED,
        PURCHASE_ORDER_STATUS.RECEIVED,
        PURCHASE_ORDER_STATUS.PARTIAL_RECEIVED,
      ].includes(order.status)
    ) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        message:
          'Only approved, purchased, or partially received purchase orders can be received',
      });
    }

    const updatesMap = new Map();
    lines.forEach((line) => {
      const id = line.lineId || line._id || line.id;
      if (id) updatesMap.set(id.toString(), line);
    });

    const invalidLineIds = [];
    const inventoryUpdates = [];

    for (const line of order.lines) {
      const lineIdStr = line._id.toString();
      if (!updatesMap.has(lineIdStr)) continue;

      const updateData = updatesMap.get(lineIdStr);
      const currentReceived = line.quantityReceived || 0;
      const maxQty = line.quantityOrdered || 0;

      const qtyToReceive = Number(updateData.quantityToReceive);

      if (isNaN(qtyToReceive) || qtyToReceive <= 0) {
        continue;
      }

      const newReceived = currentReceived + qtyToReceive;

      if (newReceived > maxQty) {
        invalidLineIds.push(lineIdStr);
        continue;
      }

      const delta = qtyToReceive;
      line.quantityReceived = newReceived;
      inventoryUpdates.push({
        partId: line.part,
        delta,
        lineId: line._id,
      });
    }

    if (invalidLineIds.length > 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        message:
          'Invalid quantity updates: cannot decrease received quantity or exceed ordered quantity',
        invalidLines: invalidLineIds,
      });
    }

    if (!inventoryUpdates.length) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        message:
          'No quantity changes detected. Use "quantityToReceive" for incremental updates.',
      });
    }

    // Process inventory updates
    for (const update of inventoryUpdates) {
      const lineItem = order.lines.find(
        (l) => l._id.toString() === update.lineId.toString()
      );
      const incomingCost = lineItem ? Number(lineItem.unitCost) || 0 : 0;
      const incomingQty = Number(update.delta) || 0;

      // Calculate and update Tenant-Wide Average Unit Cost
      // We only update cost if we are adding stock
      if (incomingQty > 0) {
        const part = await Part.findOne({
          _id: update.partId,
          tenant: req.tenant,
        }).session(session);

        if (part) {
          // Calculate Weighted Average
          // 1. Get current total quantity across ALL locations for this tenant
          const stockAgg = await PartStock.aggregate([
            {
              $match: {
                tenant: new mongoose.Types.ObjectId(req.tenant),
                part: part._id,
              },
            },
            {
              $group: {
                _id: null,
                totalQty: { $sum: '$quantity' },
              },
            },
          ]).session(session);

          const currentQty = stockAgg.length > 0 ? stockAgg[0].totalQty : 0;
          const currentAvgCost = part.averageUnitCost || 0;

          const totalValue =
            currentQty * currentAvgCost + incomingQty * incomingCost;
          const newTotalQty = currentQty + incomingQty;

          // Avoid division by zero
          const newAvgCost =
            newTotalQty > 0 ? totalValue / newTotalQty : incomingCost;

          part.averageUnitCost = newAvgCost;
          await part.save({ session });
        }
      }

      await recordInventoryActivity(
        {
          tenant: req.tenant,
          partId: update.partId,
          locationId: order.partLocation,
          type: INVENTORY_ACTIVITY_TYPES.PURCHASE_RECEIPT,
          direction: 'IN',
          quantityChange: update.delta,
          performedBy: req.user._id,
          sourceDocumentType: SOURCE_DOCUMENT_TYPES.PURCHASE_ORDER,
          sourceDocumentId: order._id,
          sourceDocumentLineId: update.lineId,
          reason: 'Purchase Order Receipt',
        },
        session
      );
    }

    const allFullyReceived = order.lines.every(
      (line) =>
        (line.quantityReceived || 0) >= (line.quantityOrdered || 0),
    );

    const isPartiallyReceived = order.lines.some(
      (line) => (line.quantityReceived || 0) > 0
    );

    if (allFullyReceived) {
      order.status = PURCHASE_ORDER_STATUS.RECEIVED;
      order.receivedAt = new Date();
    } else if (isPartiallyReceived) {
      order.status = PURCHASE_ORDER_STATUS.PARTIAL_RECEIVED;
    }

    order._user = req.user;
    const updated = await order.save({ session });

    await session.commitTransaction();
    session.endSession();

    res.status(200).json(updated);
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    res.status(500).json({
      message: 'An error occurred while receiving purchase order',
      error: error.message,
    });
  }
});

// ─── DELETE ──────────────────────────────────────────────────────────────────

const deletePurchaseOrder = asyncHandler(async (req, res) => {
  const { id } = req.params;

  // The pre('findOneAndDelete') hook in the model handles status checks
  // and will throw an error if the PO cannot be deleted.
  const deletedOrder = await PurchaseOrder.findOneAndDelete({
    _id: id,
    tenant: req.tenant,
  });

  if (!deletedOrder) {
    // If the hook didn't throw but no document was found (or it was filtered out?)
    // Actually if the hook throws, we go to catch block (asyncHandler).
    // If we are here, it means either it was deleted or it wasn't found.
    // However, findOneAndDelete returns the document *before* deletion (or after depending on options) if found.
    // If not found, it returns null.
    return res.status(404).json({ message: 'Purchase order not found' });
  }

  res
    .status(200)
    .json({ message: 'Purchase order deleted successfully', id: deletedOrder._id });
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
  deletePurchaseOrder,
};
