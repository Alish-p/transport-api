import { Router } from 'express';
import { getVehicleGpsData } from '../controllers/gps.js';

const router = Router();
import { authenticate } from '../middlewares/Auth.js';

router.get("/:vehicleNo", authenticate, getVehicleGpsData);

export default router;
