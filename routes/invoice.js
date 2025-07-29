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

const { private, checkPermission } = require("../middlewares/Auth");
const pagination = require("../middlewares/pagination");

const router = Router();

router.post(
  "/",
  private,
  checkPermission("invoice", "create"),
  validateZod(invoiceSchema),
  createInvoice
);
router.get("/", private, pagination, fetchInvoices);
router.get("/:id", private, fetchInvoice);
router.put(
  "/:id",
  private,
  checkPermission("invoice", "update"),
  updateInvoice
);
router.delete(
  "/:id",
  private,
  checkPermission("invoice", "delete"),
  deleteInvoice
);

module.exports = router;
