const { Router } = require("express");
const {
  createTenant,
  fetchTenants,
  fetchTenantById,
  updateTenant,
  deleteTenant,
} = require("../controllers/tenant");

const { private, checkPermission } = require("../middlewares/Auth");
const pagination = require("../middlewares/pagination");

const router = Router();

router.post("/", private, checkPermission("tenant", "create"), createTenant);
router.get("/", private, pagination, fetchTenants);
router.get("/:id", private, fetchTenantById);
router.put("/:id", private, checkPermission("tenant", "update"), updateTenant);
router.delete("/:id", private, checkPermission("tenant", "delete"), deleteTenant);

module.exports = router;
