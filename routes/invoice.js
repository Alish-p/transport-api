const { Router } = require("express");
const {
  createInvoice,
  fetchInvoices,
  fetchInvoice,
  updateInvoice,
  deleteInvoice,
} = require("../controllers/invoice");

const router = Router();

router.post("/", createInvoice);
router.get("/", fetchInvoices);
router.get("/:id", fetchInvoice);
router.put("/:id", updateInvoice);
router.delete("/:id", deleteInvoice);

module.exports = router;
