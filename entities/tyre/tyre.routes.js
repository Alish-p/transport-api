import express from 'express';
import { createTyre, getTyres, getTyreById, updateTyre, updateThreadDepth } from './tyre.controller.js';
import pagination from '../../middlewares/pagination.js';
import { authenticate } from '../../middlewares/auth.js';

const router = express.Router();

router.use(authenticate);

router.route('/')
    .post(createTyre)
    .get(pagination, getTyres);

router.route('/:id')
    .get(getTyreById)
    .put(updateTyre);

router.route('/:id/thread')
    .post(updateThreadDepth);

export default router;
