import { Router } from 'express';
import {
    adjustStock,
    transferStock,
    fetchInventoryActivities,
    exportInventoryActivities,
} from './partStock.controller.js';
import { checkPermission } from '../../../middlewares/auth.js';
import pagination from '../../../middlewares/pagination.js';

const router = Router();

// Transactions History
router.get('/transactions', pagination, fetchInventoryActivities);
router.get('/export', exportInventoryActivities);

// Stock Adjustments
router.post(
    '/adjust',
    checkPermission('part', 'update'), // Using 'part' permission for now, or could be 'inventory'
    adjustStock,
);

// Stock Transfers
router.post(
    '/transfer',
    checkPermission('part', 'update'),
    transferStock,
);

export default router;
