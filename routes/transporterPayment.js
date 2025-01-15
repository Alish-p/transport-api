const { Router } = require("express");
const {
  createTransporterPaymentReceipt,
  fetchTransporterPaymentReceipts,
  fetchTransporterPaymentReceipt,
  updateTransporterPaymentReceipt,
  deleteTransporterPaymentReceipt,
} = require("../controllers/transporterPayment");

const router = Router();

router.post("/", createTransporterPaymentReceipt);
router.get("/", fetchTransporterPaymentReceipts);
router.get("/:id", fetchTransporterPaymentReceipt);
router.put("/:id", updateTransporterPaymentReceipt);
router.delete("/:id", deleteTransporterPaymentReceipt);

module.exports = router;
