const { Router } = require("express");
const {
  createSubtrip,
  fetchSubtrips,
  fetchSubtrip,
  updateSubtrip,
  deleteSubtrip,
  addExpenseToSubtrip,
  addMaterialInfo,
  receiveLR,
  CloseSubtrip,
  resolveLR,
} = require("../controllers/subtrip");

const { admin } = require("../middlewares/Auth");
const router = Router();

router.post("/:tripId", createSubtrip);
router.get("/", fetchSubtrips);
router.get("/:id", fetchSubtrip);

router.put("/:id", updateSubtrip);
router.delete("/:id", admin, deleteSubtrip);
router.post("/:id/expense", addExpenseToSubtrip);

router.put("/:id/material-info", addMaterialInfo);
router.put("/:id/receive", receiveLR);
router.put("/:id/resolve", resolveLR);
router.put("/:id/close", CloseSubtrip);

module.exports = router;
