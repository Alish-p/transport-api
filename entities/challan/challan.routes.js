import { Router } from 'express';
import { authenticate, checkPermission } from '../../middlewares/auth.js';
import { getChallansFromDB, syncChallansFromProvider } from './challan.controller.js';

const router = Router();

// 1) Return challans from DB with last refreshed info
router.get(
  '/',
  authenticate,
  checkPermission('vehicle', 'view'),
  getChallansFromDB,
);

// 2) Sync/refetch challans from provider (enforces 10-day cooldown)
router.post(
  '/sync',
  authenticate,
  checkPermission('vehicle', 'view'),
  syncChallansFromProvider,
);

export default router;
