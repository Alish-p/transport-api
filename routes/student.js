const express = require("express");
const router = express.Router();
const {
  fetchStudents,
  newRegistration,
  fetchAvailableSeats,
  fetchStudentByNumber,
  fetchExpires,
  newHalfRegistration,
  fetchHalfDayRegistrations,
  extendMembershipByDay,
  changeSeat,
  fetchTodaysData,
  fetchContactNumbers,
} = require("../controllers/student");
const { private } = require("../middlewares/Auth");

router.post("/", newRegistration);
router.post("/half-day", private, newHalfRegistration);
router.post("/extend/:id", private, extendMembershipByDay);
router.post("/change-seat", private, changeSeat);
router.get("/half-day", private, fetchHalfDayRegistrations);
router.get("/", private, fetchStudents);
router.get("/contact-numbers", fetchContactNumbers);
router.get("/seats", private, private, fetchAvailableSeats);
router.get("/todays", private, fetchTodaysData);
router.get("/expires", private, fetchExpires);
router.get("/:mobile", private, fetchStudentByNumber);

module.exports = router;
