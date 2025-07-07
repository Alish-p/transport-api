const { Router } = require("express");
const {
  createBank,
  fetchBanks,
  deleteBank,
  updateBank,
  fetchBankDetails,
} = require("../controllers/bank");

const { private, admin, checkPermission } = require("../middlewares/Auth");
const pagination = require("../middlewares/pagination");
const router = Router();

router.post("/", private, checkPermission("bank", "create"), createBank);
router.get("/", private, pagination, fetchBanks);
router.get("/:id", private, fetchBankDetails);
router.delete("/:id", private, checkPermission("bank", "delete"), deleteBank);
router.put("/:id", private, checkPermission("bank", "update"), updateBank);

module.exports = router;
