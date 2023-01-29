const express = require("express");
const router = express.Router();
const {
  fetchFulldayRegistrations,
  newRegistration,
  fetchAvailableSeats,
  fetchStudentByNumber,
  fetchFulldayExpires,
  newHalfRegistration,
  fetchHalfDayRegistrations,
  extendMembershipByDay,
  changeSeat,
  fetchTodaysData,
  fetchContactNumbers,
  fetchHalfDayExpires,
  fetchAllStudents,
} = require("../controllers/registration");
const { private } = require("../middlewares/Auth");

router.post("/", newRegistration);
router.post("/half-day", private, newHalfRegistration);
router.post("/extend/:id", private, extendMembershipByDay);
router.post("/change-seat", private, changeSeat);
router.get("/half-day", private, fetchHalfDayRegistrations);
router.get("/", private, fetchFulldayRegistrations);
router.get("/all-student", private, fetchAllStudents);
router.get("/contact-numbers", fetchContactNumbers);
router.get("/seats", private, private, fetchAvailableSeats);
router.get("/todays", private, fetchTodaysData);
router.get("/expires", private, fetchFulldayExpires);
router.get("/expiresHalfDay", private, fetchHalfDayExpires);
router.get("/:mobile", private, fetchStudentByNumber);

module.exports = router;
