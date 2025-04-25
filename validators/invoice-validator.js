const { z } = require("zod");

const invoiceSchema = z.object({
  body: z.object({
    customerId: z.string().min(1, "Customer is required"),
    billingPeriod: z.object({
      start: z.coerce.date(),
      end: z.coerce.date(),
    }),
    dueDate: z.coerce.date().optional(),
    subtripIds: z
      .array(z.string())
      .min(1, "At least one subtrip must be selected"),
    notes: z.string().optional(),
    additionalCharges: z
      .array(
        z.object({
          label: z.string(),
          amount: z.number().nonnegative(),
        })
      )
      .optional(),
  }),
});

module.exports = {
  invoiceSchema,
};
