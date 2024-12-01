const { Router } = require("express");
const {
  createDriverSalary,
  fetchDriverSalaries,
  fetchDriverSalary,
  updateDriverSalary,
  deleteDriverSalary,
} = require("../controllers/driverSalary");

const router = Router();

router.post("/", createDriverSalary);
router.get("/", fetchDriverSalaries);
router.get("/:id", fetchDriverSalary);
router.put("/:id", updateDriverSalary);
router.delete("/:id", deleteDriverSalary);

module.exports = router;
