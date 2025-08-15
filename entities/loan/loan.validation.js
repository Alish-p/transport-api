import { z } from 'zod';

const loanSchema = z.object({
  body: z.object({
    borrowerId: z.string().min(1, 'Borrower is required'),
    borrowerType: z.enum(['Driver', 'Transporter', 'Employee']),
    principalAmount: z.number(),
    interestRate: z.number(),
    tenureMonths: z.number(),
    disbursementDate: z.coerce.date(),
    remarks: z.string().optional(),
  }),
});

export { loanSchema };
