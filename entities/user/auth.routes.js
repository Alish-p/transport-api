import { Router } from 'express';
import { authenticate } from '../../middlewares/auth.js';
import { loginUser, getUser } from './auth.controller.js';

const router = Router();

router.get("/my-account", authenticate, getUser);
router.post("/login", loginUser);

export default router;
