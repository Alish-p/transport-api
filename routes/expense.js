import { Router } from 'express';
import { createExpense,
  fetchPaginatedExpenses,
  fetchExpense,
  updateExpense,
  deleteExpense, } from '../controllers/expense.js';

import { authenticate, checkPermission } from '../middlewares/Auth.js';
import pagination from '../middlewares/pagination.js';

const router = Router();

router.post("/", authenticate, checkPermission("expense", "create"), createExpense);
router.get("/pagination", authenticate, pagination, fetchPaginatedExpenses);
router.get("/:id", authenticate, fetchExpense);
router.put(
  "/:id",
  authenticate,
  checkPermission("expense", "update"),
  updateExpense
);
router.delete(
  "/:id",
  authenticate,
  checkPermission("expense", "delete"),
  deleteExpense
);

export default router;
