import { Router } from 'express';
import {
  createDriverSalary,
  fetchDriverSalaries,
  fetchPaginatedDriverSalaries,
  fetchDriverSalary,
  updateDriverSalary,
  deleteDriverSalary,
  exportDriverSalaries,
} from './driverSalary.controller.js';

import { authenticate, checkPermission } from '../../middlewares/auth.js';
import pagination from '../../middlewares/pagination.js';

const router = Router();

router.post(
  "/",
  authenticate,
  checkPermission("driverSalary", "create"),
  createDriverSalary
);
router.get("/export", authenticate, exportDriverSalaries);
router.get("/", authenticate, fetchDriverSalaries);
router.get("/paginated", authenticate, pagination, fetchPaginatedDriverSalaries);
router.get("/:id", authenticate, fetchDriverSalary);
router.put(
  "/:id",
  authenticate,
  checkPermission("driverSalary", "update"),
  updateDriverSalary
);
router.delete(
  "/:id",
  authenticate,
  checkPermission("driverSalary", "delete"),
  deleteDriverSalary
);

export default router;
