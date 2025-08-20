import { z } from 'zod';

const tripSchema = z.object({
  body: z.object({
    fromDate: z.string(),
    remarks: z.string().optional(),
  }),
});

export { tripSchema };
