import { Router } from 'express';

import { authenticate } from '../../middlewares/auth.js';
import { getTargets, createTarget, updateTarget, deleteTarget } from './customerTarget.controller.js';

const router = Router();

router.post('/', authenticate, createTarget);
router.get('/', authenticate, getTargets);
router.put('/:id', authenticate, updateTarget);
router.delete('/:id', authenticate, deleteTarget);

export default router;
