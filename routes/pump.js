const { Router } = require("express");
const {
  createPump,
  fetchPumps,
  deletePump,
  fetchPumpById,
  updatePump,
} = require("../controllers/pump");

const { private, admin, checkPermission } = require("../middlewares/Auth");
const router = Router();

router.post("/", private, checkPermission("pump", "create"), createPump);
router.get("/", private, fetchPumps);
router.get("/:id", private, fetchPumpById);
router.delete("/:id", private, checkPermission("pump", "delete"), deletePump);
router.put("/:id", private, checkPermission("pump", "update"), updatePump);

module.exports = router;
