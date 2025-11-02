import { Router } from 'express';
import { fetchSubtripPublic } from '../entities/subtrip/subtrip.controller.js';
import { fetchTransporterPaymentReceiptPublic } from '../entities/transporterPayment/transporterPayment.controller.js';

const router = Router();

// Public endpoints: no auth, no tenant scoping
router.get('/subtrips/:id', fetchSubtripPublic);
router.get('/transporter-payments/:id', fetchTransporterPaymentReceiptPublic);

export default router;

