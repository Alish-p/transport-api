import { Router } from 'express';
import { getVehicleGpsData } from './gps.controller.js';
import { authenticate } from '../../middlewares/auth.js';

const router = Router();

router.get('/:vehicleNo', authenticate, getVehicleGpsData);

export default router;
