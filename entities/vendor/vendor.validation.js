import { z } from 'zod';

const vendorSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Vendor name is required'),
    phone: z.string().min(1, 'Phone number is required'),
    address: z.string().min(1, 'Address is required'),
    // Optional bank details. If provided, fields are individually optional.
    bankDetails: z
      .object({
        name: z.string().optional(),
        branch: z.string().optional(),
        ifsc: z.string().optional(),
        place: z.string().optional(),
        accNo: z.string().optional(),
      })
      .optional(),
  }),
});

export { vendorSchema };
