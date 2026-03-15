import { Router } from 'express';
import { getVehicleGpsData, getAllVehicleGpsData } from './gps.controller.js';
import { authenticate } from '../../middlewares/auth.js';

const router = Router();

router.get('/', authenticate, getAllVehicleGpsData);
router.get('/:vehicleNo', authenticate, getVehicleGpsData);

export default router;
