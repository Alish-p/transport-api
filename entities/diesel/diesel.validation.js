import { z } from 'zod';

const dieselPriceSchema = z.object({
  body: z.object({
    pump: z.string().min(1, 'Pump is required'),
    price: z.number({ invalid_type_error: 'Price must be a number' }),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
  }),
});

export { dieselPriceSchema };
