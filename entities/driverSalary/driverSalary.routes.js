import { Router } from 'express';
import {
  createDriverSalary,
  fetchDriverSalaries,
  fetchDriverSalary,
  updateDriverSalary,
  deleteDriverSalary,
} from './driverSalary.controller.js';

import { authenticate, checkPermission } from '../../middlewares/Auth.js';

const router = Router();

router.post(
  "/",
  authenticate,
  checkPermission("driverSalary", "create"),
  createDriverSalary
);
router.get("/", authenticate, fetchDriverSalaries);
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
