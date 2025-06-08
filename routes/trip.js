const { Router } = require("express");
const {
  createTrip,
  fetchTrips,
  fetchTrip,
  updateTrip,
  deleteTrip,
  fetchOpenTrips,
  closeTrip,
} = require("../controllers/trip");

const { private, admin, checkPermission } = require("../middlewares/Auth");
const router = Router();

router.get("/", private, fetchTrips);
router.get("/open", private, fetchOpenTrips);

router.post("/", private, checkPermission("trip", "create"), createTrip);
router.get("/:id", private, fetchTrip);
router.put("/:id", private, checkPermission("trip", "update"), updateTrip);
router.delete("/:id", private, checkPermission("trip", "delete"), deleteTrip);

router.put("/:id/close", private, closeTrip);

module.exports = router;
