import { Router } from 'express';
import { createBank,
  fetchBanks,
  deleteBank,
  updateBank,
  fetchBankDetails, } from '../controllers/bank.js';

import { authenticate, checkPermission } from '../middlewares/Auth.js';
import pagination from '../middlewares/pagination.js';

const router = Router();

router.post("/", authenticate, checkPermission("bank", "create"), createBank);
router.get("/", authenticate, pagination, fetchBanks);
router.get("/:id", authenticate, fetchBankDetails);
router.delete("/:id", authenticate, checkPermission("bank", "delete"), deleteBank);
router.put("/:id", authenticate, checkPermission("bank", "update"), updateBank);

export default router;
