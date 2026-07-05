import { z } from 'zod';

import { FREIGHT_MODELS, FIELD_CONFIG_DEFAULTS } from './subtrip.constants.js';
import { getStartOfTodayIST } from '../../utils/time-utils.js';
import Tenant from '../tenant/tenant.model.js';
import Subtrip from './subtrip.model.js';

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

/**
 * Express middleware factory for subtrip dynamic field config validation.
 * Validates required fields, strips hidden fields, and checks freight model based on Tenant config.
 */
export const validateSubtripConfig = async (req, res, next) => {
  try {
    // req.tenant is just an ObjectId from auth middleware
    const tenantDoc = await Tenant.findById(req.tenant).lean();
    
    if (!tenantDoc) {
      const error = new Error('Tenant not found');
      error.status = 404;
      return next(error);
    }

    const config = tenantDoc.config?.subtrip || {};
    const defaults = FIELD_CONFIG_DEFAULTS.subtrip;
    
    let fields = config.fields || defaults.fields;
    if (fields instanceof Map) {
      fields = Object.fromEntries(fields);
    }
    
    const allowedModels = config.allowedFreightModels?.length ? config.allowedFreightModels : defaults.allowedFreightModels;
    
    const errors = [];

    let bodyToValidate = { ...req.body };
    if (req.method === 'PUT' && req.params.id) {
      const existing = await Subtrip.findOne({ _id: req.params.id, tenant: req.tenant._id }).lean();
      if (existing) {
        bodyToValidate = {
          ...existing,
          ...req.body,
          freightDetails: {
            ...existing.freightDetails,
            ...req.body.freightDetails,
          },
          commissionDetails: {
            ...existing.commissionDetails,
            ...req.body.commissionDetails,
          },
        };
      }
    }

    for (const [fieldName, fieldConfig] of Object.entries(fields)) {
      const { visibility } = fieldConfig;

      if (visibility === 'required') {
        if (
          bodyToValidate.isEmpty &&
          !['loadingPoint', 'unloadingPoint', 'remarks'].includes(fieldName)
        ) {
          continue;
        }

        const value = bodyToValidate[fieldName];
        if (value === undefined || value === null || value === '') {
          const label = fieldConfig.label || fieldName;
          errors.push(`${label} is required`);
        }
      }

      if (visibility === 'hidden') {
        delete req.body[fieldName];
      }
    }

    if (allowedModels?.length) {
      const freightModel =
        req.body.freightDetails?.freightModel || req.body.freightModel;

      if (freightModel && !allowedModels.includes(freightModel)) {
        errors.push(
          `Freight model "${freightModel}" is not allowed. Allowed: ${allowedModels.join(', ')}`
        );
      }
    }

    if (errors.length) {
      const error = new Error(errors.join(', '));
      error.status = 400;
      return next(error);
    }

    req.fieldConfig = { fields, allowedFreightModels: allowedModels };
    next();
  } catch (err) {
    next(err);
  }
};
