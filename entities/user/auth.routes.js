import { Router } from 'express';

import { authenticate } from '../../middlewares/auth.js';
import { getUser, loginUser, resetPassword, forgotPassword, verifyWhatsAppOTP, requestWhatsAppOTP } from './auth.controller.js';

const router = Router();

router.get("/my-account", authenticate, getUser);
router.post("/login", loginUser);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);
router.post("/whatsapp-otp", requestWhatsAppOTP);
router.post("/whatsapp-verify", verifyWhatsAppOTP);

export default router;
