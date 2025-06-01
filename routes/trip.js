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

const { private, admin } = require("../middlewares/Auth");
const router = Router();

router.get("/", fetchTrips);
router.get("/open", fetchOpenTrips);

router.post("/", createTrip);
router.get("/:id", fetchTrip);
router.put("/:id", updateTrip);
router.delete("/:id", deleteTrip);

router.put("/:id/close", private, closeTrip);

module.exports = router;
