import { Router } from 'express';
import {
  createRoute,
  fetchRoutes,
  deleteRoute,
  updateRoute,
  fetchSingleRoute,
} from './route.controller.js';

import { authenticate, checkPermission } from '../../middlewares/Auth.js';
import pagination from '../../middlewares/pagination.js';

const router = Router();

router.post("/", authenticate, checkPermission("route", "create"), createRoute);
router.get("/", authenticate, pagination, fetchRoutes);

router.get("/:id", authenticate, fetchSingleRoute);
router.delete("/:id", authenticate, checkPermission("route", "delete"), deleteRoute);
router.put("/:id", authenticate, checkPermission("route", "update"), updateRoute);

export default router;
