const { Router } = require("express");
const {
  createDriver,
  fetchDrivers,
  deleteDriver,
  updateDriver,
} = require("../controllers/driver");

const { private, admin } = require("../middlewares/Auth");
const router = Router();

router.post("/", createDriver);
router.get("/", fetchDrivers);
router.delete("/:id", admin, deleteDriver);
router.put("/:id", updateDriver);

module.exports = router;
