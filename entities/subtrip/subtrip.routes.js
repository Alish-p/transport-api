import { Router } from 'express';
import pagination from '../../middlewares/pagination.js';
import { authenticate, checkPermission } from '../../middlewares/Auth.js';
import {
  fetchSubtrips,
  fetchSubtrip,
  updateSubtrip,
  deleteSubtrip,
  receiveLR,
  resolveLR,
  fetchSubtripsByStatuses,
  fetchSubtripsByTransporter,
  fetchPaginatedSubtrips,
  exportSubtrips,
} from './subtrip.controller.js';
import { createJob } from '../job/job.controller.js';
import validate from '../../middlewares/validate.js';
import { jobCreateSchema, } from '../job/job.validation.js';

const router = Router();

// new route for job creation
router.post('/jobs', authenticate, checkPermission('subtrip', 'create'), validate(jobCreateSchema), createJob);

router.get("/export", authenticate, exportSubtrips);
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

export default router;
