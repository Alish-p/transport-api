import { z } from 'zod';

const transporterSchema = z.object({
  body: z.object({
    transportName: z.string().min(1, 'Transport name is required'),
    address: z.string().min(1, 'Address is required'),
    state: z.string().min(1, 'State is required'),
    cellNo: z.string().min(1, 'Cell number is required'),
    ownerName: z.string().min(1, 'Owner name is required'),
    gstEnabled: z.boolean(),
    tdsPercentage: z.number(),
    podCharges: z.number(),
    pinNo: z.string().optional(),
    paymentMode: z.string().optional(),
    panNo: z.string().optional(),
    gstNo: z.string().optional(),
    emailId: z.string().optional(),
    bankDetails: z.object({
      name: z.string(),
      branch: z.string(),
      ifsc: z.string(),
      place: z.string(),
      accNo: z.string(),
    }),
  }),
});

export { transporterSchema };
