import { z } from 'zod';

export const createTransporterPaymentSchema = z.object({
  transporterId: z.string(),
  associatedSubtrips: z.array(z.string()).min(1, 'At least one subtrip required'),
  additionalCharges: z
    .array(
      z.object({
        label: z.string(),
        amount: z.number(),
      })
    )
    .optional(),
  meta: z.any().optional(),
});

export const updateTransporterPaymentSchema = createTransporterPaymentSchema.partial();
