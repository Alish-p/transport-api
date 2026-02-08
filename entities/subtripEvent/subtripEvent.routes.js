import { Router } from 'express';
import { fetchSubtripEvents } from './subtripEvent.controller.js';
import { authenticate } from '../../middlewares/auth.js';

const router = Router();

router.get("/:subtripId", authenticate, fetchSubtripEvents);

export default router;
