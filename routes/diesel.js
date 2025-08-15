import { Router } from 'express';
import { createDieselPrice,
  fetchDieselPrices,
  deleteDieselPrice,
  updateDieselPrice,
  fetchDieselPrice,
  fetchDieselPriceOnDate, } from '../controllers/diesel.js';

import { authenticate, checkPermission } from '../middlewares/Auth.js';
import pagination from '../middlewares/pagination.js';

const router = Router();

router.post(
  "/",
  authenticate,
  checkPermission("diesel", "create"),
  createDieselPrice
);
router.get("/", authenticate, pagination, fetchDieselPrices);
router.get("/:pump/:date", authenticate, fetchDieselPriceOnDate);
router.get("/:id", authenticate, fetchDieselPrice);
router.delete(
  "/:id",
  authenticate,
  checkPermission("diesel", "delete"),
  deleteDieselPrice
);
router.put(
  "/:id",
  authenticate,
  checkPermission("diesel", "update"),
  updateDieselPrice
);

export default router;
