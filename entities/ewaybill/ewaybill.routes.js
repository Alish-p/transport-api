import { Router } from 'express';

import { authenticate } from '../../middlewares/auth.js';
import {
  getEwayBillByNumber,
  getEwayBillsForTransporter,
} from './ewaybill.controller.js';

const router = Router();

// GET /api/ewaybill/transporter?generated_date=DD/MM/YYYY
router.get('/transporter', authenticate, getEwayBillsForTransporter);

// GET /api/ewaybill/:number
router.get('/:number', authenticate, getEwayBillByNumber);

export default router;
