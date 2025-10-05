import { z } from 'zod';


//   createJob schema
// - tripDecision is optional (market vehicles do not use trips)
// - startKm is optional and applies to Trip only when creating new & closing previous (enforced in controller)
// - routeCd required for all jobs; consignee + material required for loaded/market
const jobCreateSchema = z.object({
  body: z
    .object({
      vehicleId: z.string().min(1, 'Vehicle is required'),
      driverId: z.string().min(1, 'Driver is required'),
      isEmpty: z.boolean(),
      startDate: z.string().min(1, 'startDate is required'),

      // Trip meta (optional; controller enforces own-vehicle rules)
      tripDecision: z.enum(['attach', 'new']).optional(),
      tripId: z.string().optional(),
      fromDate: z.string().optional(),
      startKm: z.number().optional(),
      remarks: z.string().optional(),

      // Route/party
      routeCd: z.string().min(1, 'routeCd is required'),
      loadingPoint: z.string().optional(),
      unloadingPoint: z.string().optional(),

      // Loaded-only fields (required when isEmpty=false)
      customerId: z.string().optional(),
      consignee: z.string().optional(),
      loadingWeight: z.number().optional(),
      rate: z.number().optional(),
      invoiceNo: z.string().optional(),
      ewayExpiryDate: z.string().optional(),
      materialType: z.string().optional(),
      ewayBill: z.string().optional(),
      quantity: z.number().optional(),
      grade: z.string().optional(),
      shipmentNo: z.string().optional(),
      orderNo: z.string().optional(),
      referenceSubtripNo: z.string().optional(),
      diNumber: z.string().optional(),

      // Optional driver-advance inputs
      driverAdvance: z.number().optional(),
      initialAdvanceDiesel: z.any().optional(),
      driverAdvanceGivenBy: z.string().optional(),
      pumpCd: z.string().optional(),
    })
    .superRefine((body, ctx) => {
      const isLoaded = !body.isEmpty; // market treated as loaded in controller

      if (isLoaded) {
        const missing = [];
        if (!body.customerId) missing.push('customerId');
        if (!body.consignee || !body.consignee.trim()) missing.push('consignee');
        if (body.loadingWeight === undefined) missing.push('loadingWeight');
        if (body.rate === undefined) missing.push('rate');
        if (!body.invoiceNo) missing.push('invoiceNo');
        if (!body.ewayExpiryDate) missing.push('ewayExpiryDate');
        if (!body.materialType) missing.push('materialType');

        missing.forEach((f) =>
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: [f], message: `${f} is required for loaded job` })
        );

        if (missing.length === 0 && body.ewayExpiryDate) {
          const d = new Date(body.ewayExpiryDate);
          const now = new Date();
          const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          if (Number.isNaN(d.getTime())) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['ewayExpiryDate'], message: 'Invalid ewayExpiryDate' });
          } else if (d < startOfToday) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['ewayExpiryDate'], message: 'ewayExpiryDate must be today or later' });
          }
        }
      } else {
        const forbiddenForEmpty = [
          'customerId',
          'consignee',
          'loadingWeight',
          'rate',
          'invoiceNo',
          'ewayExpiryDate',
          'materialType',
        ];
        forbiddenForEmpty.forEach((f) => {
          if (body[f] !== undefined && body[f] !== null && body[f] !== '') {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: [f], message: `Field ${f} not allowed for empty job` });
          }
        });
      }
    }),
});

export { jobCreateSchema };
