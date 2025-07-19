const { Router } = require("express");
const {
  createTenant,
  fetchTenants,
  fetchTenantById,
  updateTenant
} = require("../controllers/tenant");

const { private, checkPermission } = require("../middlewares/Auth");
const pagination = require("../middlewares/pagination");

const router = Router();

router.post("/", createTenant);
router.get(
  "/",
  private,
  checkPermission("tenant", "view"),
  pagination,
  fetchTenants
);
router.get("/:id", private, checkPermission("tenant", "view"), fetchTenantById);
router.put("/:id", private, checkPermission("tenant", "update"), updateTenant);
// Delete operation is disabled for tenants

module.exports = router;
