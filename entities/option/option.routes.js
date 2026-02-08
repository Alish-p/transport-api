import express from 'express';
import {
    getOptions,
    createOption,
    updateOption,
    deleteOption,
    seedOptions,
} from './option.controller.js';
import { authenticate } from '../../middlewares/auth.js';

const router = express.Router();

router.use(authenticate);

router.post('/seed', seedOptions);
router.get('/:group', getOptions);
router.post('/', createOption);
router.put('/:id', updateOption);
router.delete('/:id', deleteOption);

export default router;
