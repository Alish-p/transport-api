import { Router } from 'express';
import { authenticate } from '../../middlewares/Auth.js';
import { getEwayBillByNumber } from './ewaybill.controller.js';

const router = Router();

// GET /api/ewaybill/:number
router.get('/:number', authenticate, getEwayBillByNumber);

export default router;

