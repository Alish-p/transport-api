import { Router } from 'express';
import {
  createWorkOrder,
  fetchWorkOrders,
  fetchWorkOrderById,
  updateWorkOrder,
  closeWorkOrder,
  deleteWorkOrder,
} from './workOrder.controller.js';
import {
  workOrderCreateSchema,
  workOrderUpdateSchema,
} from './workOrder.validation.js';
import { checkPermission } from '../../../middlewares/auth.js';
import pagination from '../../../middlewares/pagination.js';
import validate from '../../../middlewares/validate.js';

const router = Router();

// Create Work Order
router.post(
  '/',

  checkPermission('workOrder', 'create'),
  validate(workOrderCreateSchema),
  createWorkOrder,
);

// List Work Orders
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

export default router;

