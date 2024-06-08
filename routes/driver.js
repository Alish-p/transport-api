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
router.delete("/:id", deleteDriver);
router.put("/:id", updateDriver);

module.exports = router;
