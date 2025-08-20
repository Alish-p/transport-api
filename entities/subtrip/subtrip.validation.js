import { z } from 'zod';

const subtripSchema = z.object({
  body: z.object({
    tripId: z.string().min(1, "Trip is required"),
    driverId: z.string().min(1, "Driver is required"),
    vehicleId: z.string().min(1, "Vehicle is required"),
  }),
});

export { subtripSchema, };
