import { Router } from 'express';

import pagination from '../../middlewares/pagination.js';
import { authenticate, checkPermission } from '../../middlewares/auth.js';
import {
  fetchExpense,
  createExpense,
  updateExpense,
  deleteExpense,
  exportExpenses,
  fetchPaginatedExpenses,
} from './expense.controller.js';

const router = Router();

router.post(
  "/",
  authenticate,
  checkPermission("expense", "create"),
  createExpense,
);
router.get("/export", authenticate, exportExpenses);
router.get("/pagination", authenticate, pagination, fetchPaginatedExpenses);
router.get("/:id", authenticate, fetchExpense);
router.put(
  "/:id",
  authenticate,
  checkPermission("expense", "update"),
  updateExpense,
);
router.delete(
  "/:id",
  authenticate,
  checkPermission("expense", "delete"),
  deleteExpense
);

export default router;
