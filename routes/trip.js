const { Router } = require("express");
const {
  createTrip,
  fetchTrips,
  fetchTripWithTotals,
  updateTrip,
  deleteTrip,
  changeTripStatusToBilled,
} = require("../controllers/trip");

const { private, admin } = require("../middlewares/Auth");
const router = Router();

router.get("/", fetchTrips);
router.post("/", createTrip);
router.get("/:id", fetchTripWithTotals);
router.put("/:id", updateTrip);
router.delete("/:id", deleteTrip);
router.put("/:id/billed", changeTripStatusToBilled);

module.exports = router;
