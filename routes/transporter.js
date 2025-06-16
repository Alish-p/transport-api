const { Router } = require("express");
const {
  createTransporter,
  fetchTransporters,
  fetchPaginatedTransporters,
  deleteTransporter,
  updateTransporter,
  fetchTransporterById,
} = require("../controllers/transporter");

const { private, admin, checkPermission } = require("../middlewares/Auth");
const pagination = require("../middlewares/pagination");

const router = Router();

router.post("/", private, checkPermission("transporter", "create"), createTransporter);
router.get("/", private, fetchTransporters);
router.get("/pagination", pagination, fetchPaginatedTransporters);
router.get("/:id", private, fetchTransporterById);
router.delete("/:id", private, checkPermission("transporter", "delete"), deleteTransporter);
router.put("/:id", private, checkPermission("transporter", "update"), updateTransporter);

module.exports = router;
