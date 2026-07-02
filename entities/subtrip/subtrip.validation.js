import { z } from 'zod';

import { FREIGHT_MODELS } from './subtrip.constants.js';
import { getStartOfTodayIST } from '../../utils/time-utils.js';

const subtripSchema = z.object({
  body: z.object({
    tripId: z.string().min(1, "Trip is required"),
    driverId: z.string().min(1, "Driver is required"),
    vehicleId: z.string().min(1, "Vehicle is required"),
  }),
});

//   createJob schema
// - tripDecision is optional (market vehicles do not use trips)
// - startKm is optional and applies to Trip only when creating new & closing previous (enforced in controller)
// - consignee + material required for loaded/market
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

      // Points/party
      loadingPoint: z.string().optional(),
      unloadingPoint: z.string().optional(),

      // Loaded-only fields (required when isEmpty=false)
      customerId: z.string().optional(),
      consignee: z.string().optional(),
      loadingWeight: z.number().optional(),
      freightDetails: z.object({
        freightModel: z.enum(Object.values(FREIGHT_MODELS)).optional(),
        freightAmount: z.number().optional(),
        baseKm: z.number().optional(),
        rate: z.number().optional(),
        startKm: z.number().nullable().optional(),
        endKm: z.number().nullable().optional(),
        startTime: z.string().nullable().optional(),
        endTime: z.string().nullable().optional(),
      }).optional(),
      invoiceNo: z.string().optional(),
      ewayExpiryDate: z.string().nullable().optional(),
      materialType: z.string().optional(),
      ewayBill: z.string().optional(),
      quantity: z.number().optional(),
      grade: z.string().optional(),
      shipmentNo: z.string().optional(),
      orderNo: z.string().optional(),
      referenceSubtripNo: z.string().optional(),
      diNumber: z.string().optional(),
      vehicleAssignment: z.enum(['schedule', 'adhock']).optional(),

      // Optional driver-advance inputs
      driverAdvance: z.number().optional(),
      initialAdvanceDiesel: z.any().optional(),
      initialAdvanceDieselUnit: z.enum(['litre', 'amount']).optional(),
      driverAdvanceGivenBy: z.enum(['Self', 'Fuel Pump']).optional(),
      pumpCd: z.string().optional(),
    })
    .superRefine((body, ctx) => {
      const isLoaded = !body.isEmpty; // market treated as loaded in controller

      if (isLoaded) {
        if (body.ewayExpiryDate) {
          const d = new Date(body.ewayExpiryDate);
          const startOfToday = getStartOfTodayIST();
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
          'freightDetails',
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

export { subtripSchema, jobCreateSchema };
