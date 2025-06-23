const { Router } = require("express");
const {
  createSubtrip,
  fetchSubtrips,
  fetchSubtrip,
  updateSubtrip,
  deleteSubtrip,
  addMaterialInfo,
  receiveLR,
  closeSubtrip,
  resolveLR,
  createEmptySubtrip,
  closeEmptySubtrip,
  fetchSubtripsByStatuses,
  fetchSubtripsByTransporter,
  fetchPaginatedSubtrips,
} = require("../controllers/subtrip");

const { private, checkPermission } = require("../middlewares/Auth");
const pagination = require("../middlewares/pagination");

const router = Router();

router.post("/", private, checkPermission("subtrip", "create"), createSubtrip);
router.get("/pagination", pagination, fetchPaginatedSubtrips);
router.get("/status", pagination, fetchSubtripsByStatuses);
router.get("/", private, fetchSubtrips);
router.post("/by-transporter", fetchSubtripsByTransporter);
router.get("/:id", private, fetchSubtrip);

router.put("/:id", private, checkPermission("subtrip", "update"), updateSubtrip);
router.delete("/:id", private, checkPermission("subtrip", "delete"), deleteSubtrip);

router.put("/:id/material-info", private, checkPermission("subtrip", "update"), addMaterialInfo);
router.put("/:id/receive", private, checkPermission("subtrip", "update"), receiveLR);
router.put("/:id/resolve", private, checkPermission("subtrip", "update"), resolveLR);
router.put("/:id/close", private, checkPermission("subtrip", "update"), closeSubtrip);

router.post("/empty", private, checkPermission("subtrip", "create"), createEmptySubtrip);
router.put("/:id/close-empty", private, checkPermission("subtrip", "update"), closeEmptySubtrip);

module.exports = router;
