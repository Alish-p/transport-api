const { Router } = require("express");
const {
  createCustomer,
  fetchCustomers,
  fetchCustomer,
  updateCustomer,
  deleteCustomer,
  fetchCustomersSummary,
} = require("../controllers/customer");

const { private, checkPermission } = require("../middlewares/Auth");
const router = Router();

router.post("/", private, checkPermission("customer", "create"), createCustomer);
router.get("/", private, fetchCustomers);
router.get("/summary", private, fetchCustomersSummary);

router.get("/:id", private, fetchCustomer);
router.put("/:id", private, checkPermission("customer", "update"), updateCustomer);
router.delete("/:id", private, checkPermission("customer", "delete"), deleteCustomer);

module.exports = router;
