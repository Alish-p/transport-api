import { z } from 'zod';

const subtripSchema = z.object({
  body: z.object({
    tripId: z.string().min(1, "Trip is required"),
  }),
});

export { subtripSchema, };
