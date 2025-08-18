import { z } from 'zod';

const pumpSchema = z.object({
  body: z.object({
    pumpName: z.string().min(1, 'Pump name is required'),
    placeName: z.string().min(1, 'Place name is required'),
    ownerName: z.string().min(1, 'Owner name is required'),
    ownerCellNo: z.string().min(1, 'Owner cell number is required'),
    pumpPhoneNo: z.string().min(1, 'Pump phone number is required'),
    taluk: z.string().min(1, 'Taluk is required'),
    district: z.string().min(1, 'District is required'),
    contactPerson: z.string().min(1, 'Contact person is required'),
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

export { pumpSchema };
