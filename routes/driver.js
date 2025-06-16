const { Router } = require("express");
const {
  createDriver,
  fetchDrivers,
  deleteDriver,
  updateDriver,
  fetchDriverById,
  fetchDriversSummary,
} = require("../controllers/driver");

const { private, checkPermission } = require("../middlewares/Auth");
const pagination = require("../middlewares/pagination");

const router = Router();

router.post("/", private, checkPermission("driver", "create"), createDriver);
router.get("/", private, pagination, fetchDrivers);
router.get("/summary", private, fetchDriversSummary);
router.get("/:id", private, fetchDriverById);
router.delete("/:id", private, checkPermission("driver", "delete"), deleteDriver);
router.put("/:id", private, checkPermission("driver", "update"), updateDriver);

module.exports = router;
