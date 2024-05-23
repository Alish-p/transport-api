const { Router } = require("express");
const {
  createBank,
  fetchBanks,
  deleteBank,
  updateBank,
} = require("../controllers/bank");

const { private, admin } = require("../middlewares/Auth");
const router = Router();

router.post("/", createBank);
router.get("/", fetchBanks);
router.delete("/:id", admin, deleteBank);
router.post("/:id", updateBank);

module.exports = router;
