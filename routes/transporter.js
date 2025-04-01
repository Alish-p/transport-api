const { Router } = require("express");
const {
  createTransporter,
  fetchTransporters,
  deleteTransporter,
  updateTransporter,
  fetchTransporterById,
} = require("../controllers/transporter");

const { private, admin } = require("../middlewares/Auth");
const router = Router();

router.post("/", createTransporter);
router.get("/", fetchTransporters);
router.get("/:id", fetchTransporterById);
router.delete("/:id", deleteTransporter);
router.put("/:id", updateTransporter);

module.exports = router;
