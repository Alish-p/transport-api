const { Router } = require("express");
const {
  createCustomer,
  fetchCustomers,
  fetchCustomer,
  updateCustomer,
  deleteCustomer,
} = require("../controllers/customer");

const router = Router();

router.post("/", createCustomer);
router.get("/", fetchCustomers);
router.get("/:id", fetchCustomer);
router.put("/:id", updateCustomer);
router.delete("/:id", deleteCustomer);

module.exports = router;
