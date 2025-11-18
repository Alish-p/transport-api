import { z } from 'zod';
import { FUEL_TYPES } from './pump.constants.js';

const fuelPriceSchema = z.object({
  body: z.object({
    pump: z.string().min(1, 'Pump is required'),
    fuelType: z.enum(FUEL_TYPES),
    price: z.number({ invalid_type_error: 'Price must be a number' }),
    fromDate: z.coerce.date(),
    toDate: z.coerce.date(),
  }),
});

export { fuelPriceSchema };
