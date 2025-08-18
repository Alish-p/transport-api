import { z } from 'zod';

const pumpSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Pump name is required'),
    phone: z.string().min(1, 'Phone number is required'),
    address: z.string().min(1, 'Address is required'),
    bankAccount: z.object({
      name: z.string().min(1, 'Bank name is required'),
      branch: z.string().min(1, 'Branch is required'),
      ifsc: z.string().min(1, 'IFSC is required'),
      place: z.string().min(1, 'Place is required'),
      accountNumber: z.string().min(1, 'Account number is required'),
    }),
  }),
});

export { pumpSchema };
