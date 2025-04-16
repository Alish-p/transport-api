const { Router } = require("express");
const {
  createExpense,
  fetchExpenses,
  fetchExpense,
  updateExpense,
  deleteExpense,
  fetchSubtripExpenses,
} = require("../controllers/expense");

const { private, admin } = require("../middlewares/Auth");
const router = Router();

//fetch all expenses of a subtrip
router.get("/subtrip/:id", fetchSubtripExpenses);

router.post("/", createExpense);
router.get("/", fetchExpenses);
router.get("/:id", fetchExpense);
router.put("/:id", updateExpense);
router.delete("/:id", deleteExpense);

module.exports = router;
