const { Router } = require("express");
const {
  createTransporterPaymentReceipt,
  fetchTransporterPaymentReceipts,
  fetchTransporterPaymentReceipt,
  updateTransporterPaymentReceipt,
  deleteTransporterPaymentReceipt,
  createBulkTransporterPaymentReceipts,
} = require("../controllers/transporterPayment");

const router = Router();

router.post("/", createTransporterPaymentReceipt);
router.post("/bulk-transporter-payment", createBulkTransporterPaymentReceipts);
router.get("/", fetchTransporterPaymentReceipts);
router.get("/:id", fetchTransporterPaymentReceipt);
router.put("/:id", updateTransporterPaymentReceipt);
router.delete("/:id", deleteTransporterPaymentReceipt);

module.exports = router;
