import { Router } from 'express';

import { authenticate, checkPermission } from '../../middlewares/auth.js';
import {
  fetchUser,
  createUser,
  fetchUsers,
  deleteUser,
  updateUser,
  fetchUsersLastSeen,
} from './user.controller.js';

const router = Router();

router.post("/", authenticate, checkPermission("user", "create"), createUser);
router.get("/", authenticate, fetchUsers);
router.get("/last-seen", authenticate, fetchUsersLastSeen);
router.delete("/:id", authenticate, checkPermission("user", "delete"), deleteUser);
router.put("/:id", authenticate, checkPermission("user", "update"), updateUser);
router.get("/:id", authenticate, fetchUser);

export default router;
