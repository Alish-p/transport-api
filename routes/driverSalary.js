const { Router } = require("express");
const {
  createDriverSalary,
  fetchDriverSalaries,
  fetchDriverSalary,
  updateDriverSalary,
  deleteDriverSalary,
} = require("../controllers/driverSalary");

const { private, checkPermission } = require("../middlewares/Auth");

const router = Router();

router.post(
  "/",
  private,
  checkPermission("driverSalary", "create"),
  createDriverSalary
);
router.get("/", private, fetchDriverSalaries);
router.get("/:id", private, fetchDriverSalary);
router.put(
  "/:id",
  private,
  checkPermission("driverSalary", "update"),
  updateDriverSalary
);
router.delete(
  "/:id",
  private,
  checkPermission("driverSalary", "delete"),
  deleteDriverSalary
);

module.exports = router;
