import { Router } from 'express';
import {
  fetchTrips,
  fetchTripsPreview,
  fetchVehicleActiveTrip,
  fetchTrip,
  updateTrip,
  deleteTrip,
  closeTrip,
} from './trip.controller.js';
import { authenticate, checkPermission } from '../../middlewares/auth.js';
import pagination from '../../middlewares/pagination.js';

const router = Router();

router.get("/", authenticate, pagination, fetchTrips);
router.get("/preview", authenticate, pagination, fetchTripsPreview);
router.get("/vehicle/:vehicleId/active", authenticate, fetchVehicleActiveTrip);
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
