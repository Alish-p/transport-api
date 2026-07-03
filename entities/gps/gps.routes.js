import { Router } from 'express';

import { authenticate } from '../../middlewares/auth.js';
import { getVehicleGpsData, getAllVehicleGpsData } from './gps.controller.js';

const router = Router();

router.get('/', authenticate, getAllVehicleGpsData);
router.get('/:vehicleNo', authenticate, getVehicleGpsData);

export default router;
