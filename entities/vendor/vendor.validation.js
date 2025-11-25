import { z } from 'zod';

const vendorSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Vendor name is required'),
    phone: z.string().min(1, 'Phone number is required'),
    address: z.string().min(1, 'Address is required'),
    bankDetails: z.object({
      name: z.string().min(1, 'Bank name is required'),
      branch: z.string().min(1, 'Branch is required'),
      ifsc: z.string().min(1, 'IFSC is required'),
      place: z.string().min(1, 'Place is required'),
      accNo: z.string().min(1, 'Account number is required'),
    }),
  }),
});

export { vendorSchema };

