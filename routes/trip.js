const { Router } = require("express");
const {
  createTrip,
  fetchTrips,
  fetchTripWithTotals,
  updateTrip,
  deleteTrip,
  addSubtripToTrip,
} = require("../controllers/trip");

const { private, admin } = require("../middlewares/Auth");
const router = Router();

router.get("/", fetchTrips);
router.post("/", createTrip);
router.get("/:id/totals", fetchTripWithTotals);
router.put("/:id", updateTrip);
router.delete("/:id", deleteTrip);
router.post("/:id/subtrip", addSubtripToTrip);

module.exports = router;
