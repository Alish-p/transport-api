import express from 'express';
import { fetchActivity } from './activity.controller.js';
import pagination from '../../middlewares/pagination.js';

const router = express.Router();

router.get('/:entityType/:entityId', pagination, fetchActivity);

export default router;
