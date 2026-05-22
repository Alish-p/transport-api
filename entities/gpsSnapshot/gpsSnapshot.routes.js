import { Router } from 'express';
import { fetchGpsSnapshots } from './gpsSnapshot.controller.js';
import { authenticate } from '../../middlewares/auth.js';

const router = Router();

router.get('/:vehicleNo', authenticate, fetchGpsSnapshots);

export default router;
