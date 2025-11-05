import { Router } from 'express';
import { authenticate } from '../../middlewares/Auth.js';
import { gstLookupGeneric } from './gst.controller.js';

const router = Router();

// Generic GST lookup for multiple forms
router.post('/gst', authenticate, gstLookupGeneric);

export default router;

