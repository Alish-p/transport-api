const { Router } = require("express");
const {
  createCustomer,
  fetchCustomers,
  fetchCustomer,
  updateCustomer,
  deleteCustomer,
  fetchCustomersSummary,
  getCustomerMonthlyMaterialWeight,
  getCustomerSubtripMonthlyData,
  getCustomerRoutes,
  getCustomerInvoiceAmountSummary,
} = require("../controllers/customer");

const { private, checkPermission } = require("../middlewares/Auth");
const pagination = require("../middlewares/pagination");

const router = Router();

router.post(
  "/",
  private,
  checkPermission("customer", "create"),
  createCustomer
);
router.get("/", private, pagination, fetchCustomers);
router.get("/summary", private, fetchCustomersSummary);

router.get(
  "/:id/monthly-material-weight",
  private,
  getCustomerMonthlyMaterialWeight
);

router.get("/:id/subtrip-monthly-data", private, getCustomerSubtripMonthlyData);

router.get("/:id/routes", private, getCustomerRoutes);

router.get(
  "/:id/invoice-amount-summary",
  private,
  getCustomerInvoiceAmountSummary
);

router.get("/:id", private, fetchCustomer);
router.put(
  "/:id",
  private,
  checkPermission("customer", "update"),
  updateCustomer
);
router.delete(
  "/:id",
  private,
  checkPermission("customer", "delete"),
  deleteCustomer
);

module.exports = router;
