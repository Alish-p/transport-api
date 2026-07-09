import { Router } from 'express';

import validate from '../../../middlewares/validate.js';
import pagination from '../../../middlewares/pagination.js';
import { authenticate, checkPermission } from '../../../middlewares/auth.js';
import {
  purchaseOrderCloseSchema,
  purchaseOrderCreateSchema,
  purchaseOrderReceiveSchema,
} from './purchaseOrder.validation.js';
import {
  closePurchaseOrder,
  createPurchaseOrder,
  fetchPurchaseOrders,
  updatePurchaseOrder,
  rejectPurchaseOrder,
  deletePurchaseOrder,
  approvePurchaseOrder,
  receivePurchaseOrder,
  exportPurchaseOrders,
  fetchPurchaseOrderById,
} from './purchaseOrder.controller.js';

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
router.get('/export', authenticate, checkPermission('purchaseOrder', 'view'), exportPurchaseOrders);
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



// Receive items and update stock
router.put(
  '/:id/receive',
  authenticate,
  checkPermission('purchaseOrder', 'update'),
  validate(purchaseOrderReceiveSchema),
  receivePurchaseOrder,
);

// Close PO (force close partial/received)
router.put(
  '/:id/close',
  authenticate,
  checkPermission('purchaseOrder', 'update'),
  validate(purchaseOrderCloseSchema),
  closePurchaseOrder,
);

// Delete
router.delete(
  '/:id',
  authenticate,
  checkPermission('purchaseOrder', 'delete'),
  deletePurchaseOrder,
);

export default router;

