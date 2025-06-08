const { Router } = require("express");
const {
  createExpense,
  fetchExpenses,
  fetchExpense,
  updateExpense,
  deleteExpense,
  fetchSubtripExpenses,
} = require("../controllers/expense");

const { private, admin, checkPermission } = require("../middlewares/Auth");
const router = Router();

//fetch all expenses of a subtrip
router.get("/subtrip/:id", private, fetchSubtripExpenses);

router.post("/", private, checkPermission("expense", "create"), createExpense);
router.get("/", private, fetchExpenses);
router.get("/:id", private, fetchExpense);
router.put("/:id", private, checkPermission("expense", "update"), updateExpense);
router.delete("/:id", private, checkPermission("expense", "delete"), deleteExpense);

module.exports = router;
