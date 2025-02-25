const { Router } = require("express");
const {
  createBank,
  fetchBanks,
  deleteBank,
  updateBank,
  fetchBankDetails,
} = require("../controllers/bank");

const { private, admin } = require("../middlewares/Auth");
const router = Router();

router.post("/", createBank);
router.get("/", fetchBanks);
router.get("/:id", fetchBankDetails);
router.delete("/:id", deleteBank);
router.put("/:id", updateBank);

module.exports = router;
