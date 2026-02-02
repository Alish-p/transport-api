import { z } from 'zod';
import {
  WORK_ORDER_PRIORITY,
  WORK_ORDER_STATUS,
} from './workOrder.constants.js';

const partLineSchema = z.object({
  part: z.string().optional(),
  name: z.string().optional(),
  partLocation: z.string().optional(),
  quantity: z
    .number()
    .positive('Quantity must be greater than zero'),
  price: z.number().nonnegative('Price cannot be negative'),
});

const workOrderCreateSchema = z.object({
  body: z.object({
    vehicle: z.string().min(1, 'Vehicle is required'),
    status: z.enum(Object.values(WORK_ORDER_STATUS)).optional(),
    priority: z.enum(Object.values(WORK_ORDER_PRIORITY)).optional(),
    scheduledStartDate: z.coerce.date().optional(),
    actualStartDate: z.coerce.date().optional(),
    completedDate: z.coerce.date().optional(),

    odometerReading: z.number().nonnegative().optional(),
    issues: z
      .array(
        z.object({
          issue: z.string(),
          assignedTo: z.string().optional(),
        })
      )
      .optional(),
    labourCharge: z.number().nonnegative().optional(),
    parts: z.array(partLineSchema).optional(),
    description: z.string().optional(),
    category: z.string().optional(),
  }),
});

const workOrderUpdateSchema = z.object({
  body: z.object({
    vehicle: z.string().optional(),
    status: z.enum(Object.values(WORK_ORDER_STATUS)).optional(),
    priority: z.enum(Object.values(WORK_ORDER_PRIORITY)).optional(),
    scheduledStartDate: z.coerce.date().optional(),
    actualStartDate: z.coerce.date().optional(),
    completedDate: z.coerce.date().optional(),

    odometerReading: z.number().nonnegative().optional(),
    issues: z
      .array(
        z.object({
          issue: z.string(),
          assignedTo: z.string().optional(),
        })
      )
      .optional(),
    labourCharge: z.number().nonnegative().optional(),
    parts: z.array(partLineSchema).optional(),
    description: z.string().optional(),
    category: z.string().optional(),
  }),
});

export { workOrderCreateSchema, workOrderUpdateSchema };

