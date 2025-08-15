import { z } from 'zod';

const customerSchema = z.object({
  body: z.object({
    customerName: z.string().min(1, 'Customer name is required'),
    gstEnabled: z.boolean(),
    address: z.string().min(1, 'Address is required'),
    state: z.string().min(1, 'State is required'),
    invoicePrefix: z.string().min(1, 'Invoice prefix is required'),
    currentInvoiceSerialNumber: z.number(),
    GSTNo: z.string().optional(),
    PANNo: z.string().optional(),
    pinCode: z.string().optional(),
    cellNo: z.string().optional(),
    transporterCode: z.string().optional(),
    invoiceSuffix: z.string().optional(),
    invoiceDueInDays: z.number().optional(),
    bankDetails: z
      .object({
        name: z.string(),
        branch: z.string(),
        ifsc: z.string(),
        place: z.string(),
        accNo: z.string(),
      })
      .optional(),
    consignees: z
      .array(
        z.object({
          name: z.string(),
          address: z.string(),
          state: z.string(),
          pinCode: z.string(),
        })
      )
      .optional(),
  }),
});

export { customerSchema };
