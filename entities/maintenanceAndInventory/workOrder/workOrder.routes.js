import { Router } from 'express';

import validate from '../../../middlewares/validate.js';
import pagination from '../../../middlewares/pagination.js';
import { checkPermission } from '../../../middlewares/auth.js';
import {
  workOrderCreateSchema,
  workOrderUpdateSchema,
} from './workOrder.validation.js';
import {
  closeWorkOrder,
  createWorkOrder,
  fetchWorkOrders,
  updateWorkOrder,
  deleteWorkOrder,
  exportWorkOrders,
  fetchWorkOrderById,
  addWorkOrderExpense
} from './workOrder.controller.js';

const router = Router();

// Create Work Order
router.post(
  '/',

  checkPermission('workOrder', 'create'),
  validate(workOrderCreateSchema),
  createWorkOrder,
);

// List Work Orders
router.get('/export', checkPermission('workOrder', 'view'), exportWorkOrders);
router.get('/', pagination, fetchWorkOrders);

// Get Work Order by ID
router.get('/:id', fetchWorkOrderById);

// Update Work Order
router.put(
  '/:id',

  checkPermission('workOrder', 'update'),
  validate(workOrderUpdateSchema),
  updateWorkOrder,
);

// Close Work Order (mark as completed and adjust inventory)
router.put(
  '/:id/close',

  checkPermission('workOrder', 'update'),
  closeWorkOrder,
);

// Delete Work Order
router.delete(
  '/:id',

  checkPermission('workOrder', 'delete'),
  deleteWorkOrder,
);

// Add final expense to a completed Work Order
router.post(
  '/:id/expense',
  checkPermission('workOrder', 'update'),
  addWorkOrderExpense
);

export default router;

