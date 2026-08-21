import express from 'express';

import { requestOtp, verifyOtp, selectTransporter } from './transporterPortalAuth.controller.js';
import {
  getDashboard,
  getProfile,
  getVehicles,
  getVehicleById,
  getSubtrips,
  getSubtripById,
  getPayments,
  getPaymentById,
  getAdvances,
} from './transporterPortal.controller.js';
import { authenticateTransporter } from '../../middlewares/authenticateTransporter.js';

const router = express.Router();

// ----------------------------------------------------------------------
// Public auth routes (no middleware)
// ----------------------------------------------------------------------
router.post('/auth/request-otp', requestOtp);
router.post('/auth/verify-otp', verifyOtp);
router.post('/auth/select-transporter', selectTransporter);

// ----------------------------------------------------------------------
// Protected data routes (transporter JWT required)
// ----------------------------------------------------------------------
router.get('/dashboard', authenticateTransporter, getDashboard);
router.get('/profile', authenticateTransporter, getProfile);
router.get('/vehicles', authenticateTransporter, getVehicles);
router.get('/vehicles/:id', authenticateTransporter, getVehicleById);
router.get('/subtrips', authenticateTransporter, getSubtrips);
router.get('/subtrips/:id', authenticateTransporter, getSubtripById);
router.get('/advances', authenticateTransporter, getAdvances);
router.get('/payments', authenticateTransporter, getPayments);
router.get('/payments/:id', authenticateTransporter, getPaymentById);

export default router;


