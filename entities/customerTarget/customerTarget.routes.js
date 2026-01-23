import { Router } from 'express';
import { createTarget, getTargets, updateTarget, deleteTarget } from './customerTarget.controller.js';
import { authenticate } from '../../middlewares/Auth.js';

const router = Router();

router.post('/', authenticate, createTarget);
router.get('/', authenticate, getTargets);
router.put('/:id', authenticate, updateTarget);
router.delete('/:id', authenticate, deleteTarget);

export default router;
