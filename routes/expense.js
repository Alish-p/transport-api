const { Router } = require("express");
const {
  createExpense,
  fetchExpenses,
  fetchExpense,
  updateExpense,
  deleteExpense,
} = require("../controllers/expense");

const { private, admin } = require("../middlewares/Auth");
const router = Router();

router.post("/", createExpense);
router.get("/", fetchExpenses);
router.get("/:id", fetchExpense);
router.put("/:id", updateExpense);
router.delete("/:id", deleteExpense);

module.exports = router;
