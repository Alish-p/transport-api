import { Router } from 'express';
import { loginUser, getUser } from '../controllers/auth.js';

import { authenticate } from '../middlewares/Auth.js';

const router = Router();

router.get("/my-account", authenticate, getUser);
router.post("/login", loginUser);

export default router;
