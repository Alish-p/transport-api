import { Router } from 'express';
import {
    adjustStock,
    transferStock,
    fetchInventoryActivities,
    checkPartPrice,
} from './partStock.controller.js';
import { checkPermission } from '../../../middlewares/Auth.js';
import pagination from '../../../middlewares/pagination.js';

const router = Router();

// Transactions History
router.get('/transactions', pagination, fetchInventoryActivities);

// Price Check
router.get('/price-check', checkPartPrice);

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
