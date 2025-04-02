const { Router } = require("express");
const {
  createEmptyTrip,
  fetchEmptyTrips,
  fetchEmptyTrip,
  closeEmptyTrip,
  deleteEmptyTrip,
} = require("../controllers/emptyTrip");

const { private } = require("../middlewares/Auth");
const router = Router();

// Basic CRUD routes
router.post("/", private, createEmptyTrip);
router.get("/", private, fetchEmptyTrips);
router.get("/:id", private, fetchEmptyTrip);
router.delete("/:id", private, deleteEmptyTrip);

// Close empty trip route
router.put("/:id/close", private, closeEmptyTrip);

module.exports = router;
