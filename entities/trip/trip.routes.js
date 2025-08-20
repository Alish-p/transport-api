import { Router } from 'express';
import {
  createTrip,
  fetchTrips,
  fetchTripsPreview,
  fetchTrip,
  updateTrip,
  deleteTrip,
  closeTrip,
} from './trip.controller.js';

import { tripSchema } from './trip.validation.js';
import { authenticate, checkPermission } from '../../middlewares/Auth.js';
import pagination from '../../middlewares/pagination.js';

const router = Router();

router.get("/", authenticate, pagination, fetchTrips);
router.get("/preview", authenticate, pagination, fetchTripsPreview);

router.post(
  "/",
  authenticate,
  checkPermission("trip", "create"),
  createTrip,
);
router.get("/:id", authenticate, fetchTrip);
router.put(
  "/:id",
  authenticate,
  checkPermission("trip", "update"),
  updateTrip,
);
router.delete(
  "/:id",
  authenticate,
  checkPermission("trip", "delete"),
  deleteTrip,
);

router.put("/:id/close", authenticate, closeTrip);

export default router;