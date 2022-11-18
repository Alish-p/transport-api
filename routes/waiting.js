const express = require("express");
const router = express.Router();
const {
  book,
  fetchBookings,
  deleteBooking,
} = require("../controllers/waiting");
const { private } = require("../middlewares/Auth");

router.post("/", private, book);
router.get("/", private, fetchBookings);
router.delete("/:id", private, deleteBooking);

module.exports = router;
