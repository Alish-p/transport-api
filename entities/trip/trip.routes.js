import { Router } from 'express';
import {
  fetchTrips,
  fetchTripsPreview,
  fetchVehicleActiveTrip,
  fetchActiveTripsMap,
  fetchTrip,
  updateTrip,
  deleteTrip,
  closeTrip,
  exportTrips,
  fetchRouteAnalytics,
} from './trip.controller.js';
import { authenticate, checkPermission } from '../../middlewares/auth.js';
import pagination from '../../middlewares/pagination.js';

const router = Router();

router.get("/export", authenticate, exportTrips);
router.get("/route-analytics", authenticate, pagination, fetchRouteAnalytics);
router.get("/", authenticate, pagination, fetchTrips);
router.get("/preview", authenticate, pagination, fetchTripsPreview);
router.get("/vehicle/:vehicleId/active", authenticate, fetchVehicleActiveTrip);
router.get("/active-trips-map", authenticate, fetchActiveTripsMap);
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
