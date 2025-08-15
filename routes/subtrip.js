import { Router } from 'express';
import { createSubtrip,
  fetchSubtrips,
  fetchSubtrip,
  updateSubtrip,
  deleteSubtrip,
  addMaterialInfo,
  receiveLR,
  resolveLR,
  createEmptySubtrip,
  closeEmptySubtrip,
  fetchSubtripsByStatuses,
  fetchSubtripsByTransporter,
  fetchPaginatedSubtrips, } from '../controllers/subtrip.js';

import { authenticate, checkPermission } from '../middlewares/Auth.js';
import pagination from '../middlewares/pagination.js';

const router = Router();

router.post("/", authenticate, checkPermission("subtrip", "create"), createSubtrip);
router.get("/pagination", authenticate, pagination, fetchPaginatedSubtrips);
router.get("/status", authenticate, pagination, fetchSubtripsByStatuses);
router.get("/", authenticate, fetchSubtrips);
router.post("/by-transporter", authenticate, fetchSubtripsByTransporter);
router.get("/:id", authenticate, fetchSubtrip);

router.put(
  "/:id",
  authenticate,
  checkPermission("subtrip", "update"),
  updateSubtrip
);
router.delete(
  "/:id",
  authenticate,
  checkPermission("subtrip", "delete"),
  deleteSubtrip
);

router.put(
  "/:id/material-info",
  authenticate,
  checkPermission("subtrip", "update"),
  addMaterialInfo
);
router.put(
  "/:id/receive",
  authenticate,
  checkPermission("subtrip", "update"),
  receiveLR
);
router.put(
  "/:id/resolve",
  authenticate,
  checkPermission("subtrip", "update"),
  resolveLR
);

router.post(
  "/empty",
  authenticate,
  checkPermission("subtrip", "create"),
  createEmptySubtrip
);
router.put(
  "/:id/close-empty",
  authenticate,
  checkPermission("subtrip", "update"),
  closeEmptySubtrip
);

export default router;
