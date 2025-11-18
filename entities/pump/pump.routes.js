import { Router } from 'express';
import {
  createPump,
  fetchPumps,
  deletePump,
  fetchPumpById,
  updatePump,
  createFuelPrice,
  fetchFuelPricesByPump,
  fetchCurrentFuelPrice,
  fetchFuelPriceById,
  updateFuelPrice,
  deleteFuelPrice,
} from './pump.controller.js';
import { pumpSchema } from './pump.validation.js';
import { fuelPriceSchema } from './fuelPrice.validation.js';
import { authenticate, checkPermission } from '../../middlewares/Auth.js';
import pagination from '../../middlewares/pagination.js';

const router = Router();

router.post(
  '/',
  authenticate,
  checkPermission('pump', 'create'),
  createPump,
);
router.get('/', authenticate, pagination, fetchPumps);
router.get('/:id', authenticate, fetchPumpById);
router.delete('/:id', authenticate, checkPermission('pump', 'delete'), deletePump);
router.put(
  '/:id',
  authenticate,
  checkPermission('pump', 'update'),
  updatePump,
);

// Fuel Price routes (same /api/pumps section)
router.post(
  '/:pumpId/fuel-prices',
  authenticate,
  checkPermission('pump', 'create'),
  createFuelPrice,
);

router.get(
  '/:pumpId/fuel-prices',
  authenticate,
  pagination,
  fetchFuelPricesByPump,
);

router.get(
  '/:pumpId/fuel-prices/:fuelType/current',
  authenticate,
  fetchCurrentFuelPrice,
);

router.get(
  '/:pumpId/fuel-prices/:priceId',
  authenticate,
  fetchFuelPriceById,
);

router.put(
  '/:pumpId/fuel-prices/:priceId',
  authenticate,
  checkPermission('pump', 'update'),
  updateFuelPrice,
);

router.delete(
  '/:pumpId/fuel-prices/:priceId',
  authenticate,
  checkPermission('pump', 'delete'),
  deleteFuelPrice,
);

export default router;
