import { Router } from 'express';
import { authenticate } from '../../middlewares/Auth.js';
import {
  getEwayBillByNumber,
  getEwayBillsForTransporterByState,
} from './ewaybill.controller.js';

const router = Router();

// GET /api/ewaybill/transporter-by-state?generated_date=DD/MM/YYYY&state_code=29
router.get('/transporter-by-state', authenticate, getEwayBillsForTransporterByState);

// GET /api/ewaybill/:number
router.get('/:number', authenticate, getEwayBillByNumber);

export default router;
