import { Router } from 'express';
import { getVehicleGpsData } from './gps.controller.js';
import { authenticate } from '../../middlewares/Auth.js';

const router = Router();

router.get('/:vehicleNo', authenticate, getVehicleGpsData);

export default router;
