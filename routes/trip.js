const { Router } = require("express");
const {
  createTrip,
  fetchTrips,
  fetchTripsPreview,
  fetchTrip,
  updateTrip,
  deleteTrip,
  closeTrip,
} = require("../controllers/trip");

const { private, checkPermission } = require("../middlewares/Auth");
const pagination = require("../middlewares/pagination");

const router = Router();

router.get("/:id", private, fetchTrip);
router.get("/", private, pagination, fetchTrips);
router.get("/preview", private, pagination, fetchTripsPreview);

router.post("/", private, checkPermission("trip", "create"), createTrip);
router.put("/:id", private, checkPermission("trip", "update"), updateTrip);
router.delete("/:id", private, checkPermission("trip", "delete"), deleteTrip);

router.put("/:id/close", private, closeTrip);

module.exports = router;
