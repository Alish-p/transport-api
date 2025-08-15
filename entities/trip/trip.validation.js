import { z } from 'zod';

const tripSchema = z.object({
  body: z.object({
    driverId: z.string(),
    vehicleId: z.string(),
    fromDate: z.string(),
    remarks: z.string().optional(),
    closePreviousTrips: z.boolean().optional(),
  }),
});

export { tripSchema };
