const { Router } = require("express");
const {
  createDriver,
  fetchDrivers,
  deleteDriver,
  updateDriver,
  fetchDriverById,
  fetchDriversSummary,
} = require("../controllers/driver");

const { private, admin, checkPermission } = require("../middlewares/Auth");
const router = Router();

router.post("/", private, checkPermission("driver", "create"), createDriver);
router.get("/", private, fetchDrivers);
router.get("/summary", private, fetchDriversSummary);
router.get("/:id", private, fetchDriverById);
router.delete("/:id", private, checkPermission("driver", "delete"), deleteDriver);
router.put("/:id", private, checkPermission("driver", "update"), updateDriver);

module.exports = router;
