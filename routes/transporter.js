const { Router } = require("express");
const {
  createTransporter,
  fetchTransporters,
  deleteTransporter,
  updateTransporter,
} = require("../controllers/transporter");

const { private, admin } = require("../middlewares/Auth");
const router = Router();

router.post("/", createTransporter);
router.get("/", fetchTransporters);
router.delete("/:id", deleteTransporter);
router.post("/:id", updateTransporter);

module.exports = router;
