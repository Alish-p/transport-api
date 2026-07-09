import { z } from 'zod';

import {
  PURCHASE_ORDER_TAX_TYPES,
  PURCHASE_ORDER_DISCOUNT_TYPES,
} from './purchaseOrder.constants.js';

const lineSchema = z.object({
  part: z.string().min(1, 'Part is required'),
  quantityOrdered: z
    .number()
    .positive('Quantity ordered must be greater than zero'),
  unitCost: z.number().nonnegative('Unit cost cannot be negative'),
  quantityReceived: z.number().nonnegative().optional(),
});

const purchaseOrderCreateSchema = z.object({
  body: z.object({
    vendor: z.string().min(1, 'Vendor is required'),
    partLocation: z.string().min(1, 'Part location is required'),
    description: z.string().optional(),
    lines: z
      .array(lineSchema)
      .min(1, 'At least one line item is required'),
    discountType: z
      .enum(Object.values(PURCHASE_ORDER_DISCOUNT_TYPES))
      .optional(),
    discount: z.number().nonnegative().optional(),
    shipping: z.number().nonnegative().optional(),
    taxType: z.enum(Object.values(PURCHASE_ORDER_TAX_TYPES)).optional(),
    tax: z.number().nonnegative().optional(),
  }),
});

const purchaseOrderReceiveSchema = z.object({
  body: z.object({
    notes: z.string().optional(),
    lines: z
      .array(
        z.object({
          lineId: z.string().min(1, 'lineId is required'),
          quantityToReceive: z
            .number()
            .positive('Quantity to receive must be positive'),
          actualUnitCost: z
            .number()
            .nonnegative('Actual unit cost cannot be negative'),
          tyreDetails: z.array(z.any()).optional(),
        }),
      )
      .min(1, 'At least one line update is required'),
  }),
});

const purchaseOrderCloseSchema = z.object({
  body: z.object({
    closeReason: z.string().optional(),
  }),
});

export {
  purchaseOrderCloseSchema,
  purchaseOrderCreateSchema,
  purchaseOrderReceiveSchema,
};

