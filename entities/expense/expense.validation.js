import { z } from 'zod';

const expenseSchema = z.object({
  body: z.object({
    expenseCategory: z.enum(['vehicle', 'subtrip']),
    expenseType: z.string(),
    amount: z.number(),
    subtripId: z.string().optional(),
    tripId: z.string().optional(),
    vehicleId: z.string().optional(),
    pumpCd: z.string().optional(),
    date: z.string().optional(),
    remarks: z.string().optional(),
    dieselLtr: z.number().optional(),
    dieselPrice: z.number().optional(),
    paidThrough: z.string().optional(),
    variableSalary: z.number().optional(),
    fixedSalary: z.number().optional(),
    performanceSalary: z.number().optional(),
    adblueLiters: z.number().optional(),
    adbluePrice: z.number().optional(),
  }),
});

export { expenseSchema };
