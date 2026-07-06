import { Router } from 'express';

import pagination from '../../middlewares/pagination.js';
import { authenticate, checkPermission } from '../../middlewares/auth.js';
import {
  fetchUser,
  createUser,
  deleteUser,
  fetchUsers,
  updateUser,
  exportUsers,
  fetchUsersLastSeen,
} from './user.controller.js';

const router = Router();

router.post("/", authenticate, checkPermission("user", "create"), createUser);
router.get("/", authenticate, pagination, fetchUsers);
router.get("/last-seen", authenticate, fetchUsersLastSeen);
router.get("/export", authenticate, exportUsers);
router.delete("/:id", authenticate, checkPermission("user", "delete"), deleteUser);
router.put("/:id", authenticate, checkPermission("user", "update"), updateUser);
router.get("/:id", authenticate, fetchUser);

export default router;
