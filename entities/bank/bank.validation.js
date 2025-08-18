import { z } from 'zod';

const bankSchema = z.object({
  body: z.object({
    name: z.string().min(3, 'Name is required'),
    branch: z.string().min(3, 'Branch is required'),
    ifsc: z.string().min(1, 'IFSC is required'),
    place: z.string().min(1, 'Place is required'),
  }),
});

export { bankSchema };
