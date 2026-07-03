import { Router } from 'express';

import { authenticate } from '../../middlewares/auth.js';
import { fetchGpsSnapshots } from './gpsSnapshot.controller.js';

const router = Router();

router.get('/:vehicleNo', authenticate, fetchGpsSnapshots);

export default router;
