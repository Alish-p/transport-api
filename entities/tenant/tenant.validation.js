import { z } from 'zod';

const addressSchema = z.object({
  line1: z.string().min(1, 'Address line1 is required'),
  line2: z.string().optional(),
  state: z.string().min(1, 'State is required'),
  city: z.string().min(1, 'City is required'),
  pincode: z.string().min(1, 'Pincode is required'),
});

const contactSchema = z.object({
  email: z.string().email(),
  phone: z.string().optional(),
  website: z.string().optional(),
});

const tenantSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Name is required'),
    slug: z.string().min(1, 'Slug is required'),
    address: addressSchema,
    contactDetails: contactSchema,
  }),
});

export { tenantSchema };
