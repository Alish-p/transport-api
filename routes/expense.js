const { Router } = require("express");
const {
  createExpense,
  fetchPaginatedExpenses,
  fetchExpense,
  updateExpense,
  deleteExpense,
} = require("../controllers/expense");

const { private, checkPermission } = require("../middlewares/Auth");
const pagination = require("../middlewares/pagination");

const router = Router();

router.post("/", private, checkPermission("expense", "create"), createExpense);
router.get("/pagination", private, pagination, fetchPaginatedExpenses);
router.get("/:id", private, fetchExpense);
router.put(
  "/:id",
  private,
  checkPermission("expense", "update"),
  updateExpense
);
router.delete(
  "/:id",
  private,
  checkPermission("expense", "delete"),
  deleteExpense
);

module.exports = router;
