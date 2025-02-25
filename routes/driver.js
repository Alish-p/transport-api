const { Router } = require("express");
const {
  createDriver,
  fetchDrivers,
  deleteDriver,
  updateDriver,
  fetchDriverById,
} = require("../controllers/driver");

const { private, admin } = require("../middlewares/Auth");
const router = Router();

router.post("/", createDriver);
router.get("/", fetchDrivers);
router.get("/:id", fetchDriverById);
router.delete("/:id", deleteDriver);
router.put("/:id", updateDriver);

module.exports = router;
