import { Router } from 'express';
import { authenticate, checkPermission } from '../../middlewares/Auth.js';
import {
  createUser,
  fetchUsers,
  fetchUsersLastSeen,
  deleteUser,
  updateUser,
  fetchUser,
} from './user.controller.js';

const router = Router();

router.post("/", authenticate, checkPermission("user", "create"), createUser);
router.get("/", authenticate, fetchUsers);
router.get("/last-seen", authenticate, fetchUsersLastSeen);
router.delete("/:id", authenticate, checkPermission("user", "delete"), deleteUser);
router.put("/:id", authenticate, checkPermission("user", "update"), updateUser);
router.get("/:id", authenticate, fetchUser);
export default router;
