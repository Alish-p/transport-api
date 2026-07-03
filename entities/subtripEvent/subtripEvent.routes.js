import { Router } from 'express';

import { authenticate } from '../../middlewares/auth.js';
import { fetchSubtripEvents } from './subtripEvent.controller.js';

const router = Router();

router.get("/:subtripId", authenticate, fetchSubtripEvents);

export default router;
