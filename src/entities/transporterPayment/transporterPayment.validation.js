import { z } from 'zod';

const additionalChargeSchema = z.object({
  label: z.string(),
  amount: z.number(),
});

export const transporterPaymentSchema = z.object({
  transporterId: z.string(),
  associatedSubtrips: z.array(z.string()).min(1),
  additionalCharges: z.array(additionalChargeSchema).optional(),
  meta: z.any().optional(),
});

export const validateTransporterPayment = (data) => transporterPaymentSchema.parse(data);
