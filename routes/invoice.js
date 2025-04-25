const { Router } = require("express");
const validateZod = require("../middlewares/validate");
const { invoiceSchema } = require("../validators/invoice-validator");
const {
  createInvoice,
  fetchInvoices,
  fetchInvoice,
  updateInvoice,
  deleteInvoice,
} = require("../controllers/invoice");

const router = Router();

router.post("/", validateZod(invoiceSchema), createInvoice);
router.get("/", fetchInvoices);
router.get("/:id", fetchInvoice);
router.put("/:id", updateInvoice);
router.delete("/:id", deleteInvoice);

module.exports = router;
