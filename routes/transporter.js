const { Router } = require("express");
const {
  createTransporter,
  fetchTransporters,
  deleteTransporter,
  updateTransporter,
  fetchTransporterById,
  fetchTransporterVehicles,
} = require("../controllers/transporter");

const { private, checkPermission } = require("../middlewares/Auth");
const pagination = require("../middlewares/pagination");

const router = Router();

router.get("/", private, pagination, fetchTransporters);
router.get("/:id/vehicles", private, fetchTransporterVehicles);
router.get("/:id", private, fetchTransporterById);
router.post("/", private, checkPermission("transporter", "create"), createTransporter);
router.delete("/:id", private, checkPermission("transporter", "delete"), deleteTransporter);
router.put("/:id", private, checkPermission("transporter", "update"), updateTransporter);

module.exports = router;
