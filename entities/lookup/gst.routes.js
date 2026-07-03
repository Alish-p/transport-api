import { Router } from 'express';

import { gstLookupGeneric } from './gst.controller.js';
import { authenticate } from '../../middlewares/auth.js';

const router = Router();

// Generic GST lookup for multiple forms
router.post('/gst', authenticate, gstLookupGeneric);

export default router;

