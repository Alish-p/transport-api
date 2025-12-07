import { Router } from 'express';
import {
  createPurchaseOrder,
  fetchPurchaseOrders,
  fetchPurchaseOrderById,
  updatePurchaseOrder,
  approvePurchaseOrder,
  rejectPurchaseOrder,
  payPurchaseOrder,
  receivePurchaseOrder,
  deletePurchaseOrder,
} from './purchaseOrder.controller.js';
import {
  purchaseOrderCreateSchema,
  purchaseOrderReceiveSchema,
  purchaseOrderPaySchema,
} from './purchaseOrder.validation.js';
import { authenticate, checkPermission } from '../../../middlewares/Auth.js';
import pagination from '../../../middlewares/pagination.js';
import validate from '../../../middlewares/validate.js';

const router = Router();

// Create PO (status: pending-approval)
router.post(
  '/',
  authenticate,
  checkPermission('purchaseOrder', 'create'),
  validate(purchaseOrderCreateSchema),
  createPurchaseOrder,
);

// List + filters
router.get('/', authenticate, pagination, fetchPurchaseOrders);

// Get single
router.get('/:id', authenticate, fetchPurchaseOrderById);

// Edit header/lines (restricted if received or partially received)
router.put(
  '/:id',
  authenticate,
  checkPermission('purchaseOrder', 'update'),
  updatePurchaseOrder,
);

// Approve / Reject
router.put(
  '/:id/approve',
  authenticate,
  checkPermission('purchaseOrder', 'update'),
  approvePurchaseOrder,
);

router.put(
  '/:id/reject',
  authenticate,
  checkPermission('purchaseOrder', 'update'),
  rejectPurchaseOrder,
);

// Mark as paid (Purchased)
router.put(
  '/:id/pay',
  authenticate,
  checkPermission('purchaseOrder', 'update'),
  validate(purchaseOrderPaySchema),
  payPurchaseOrder,
);

// Receive items and update stock
router.put(
  '/:id/receive',
  authenticate,
  checkPermission('purchaseOrder', 'update'),
  validate(purchaseOrderReceiveSchema),
  receivePurchaseOrder,
);

// Delete
router.delete(
  '/:id',
  authenticate,
  checkPermission('purchaseOrder', 'delete'),
  deletePurchaseOrder,
);

export default router;

