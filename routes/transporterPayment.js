const { Router } = require("express");
const {
  createTransporterPaymentReceipt,
  fetchTransporterPaymentReceipts,
  fetchTransporterPaymentReceipt,
  updateTransporterPaymentReceipt,
  deleteTransporterPaymentReceipt,
  createBulkTransporterPaymentReceipts,
} = require("../controllers/transporterPayment");

const { private, checkPermission } = require("../middlewares/Auth");
const router = Router();

router.post("/", private, checkPermission("transporterPayment", "create"), createTransporterPaymentReceipt);
router.post("/bulk-transporter-payment", private, checkPermission("transporterPayment", "create"), createBulkTransporterPaymentReceipts);
router.get("/", private, fetchTransporterPaymentReceipts);
router.get("/:id", private, fetchTransporterPaymentReceipt);
router.put("/:id", private, checkPermission("transporterPayment", "update"), updateTransporterPaymentReceipt);
router.delete("/:id", private, checkPermission("transporterPayment", "delete"), deleteTransporterPaymentReceipt);

module.exports = router;
