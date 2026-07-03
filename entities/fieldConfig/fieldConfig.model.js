import { model, Schema } from 'mongoose';

import { FREIGHT_MODELS } from '../subtrip/subtrip.constants.js';

const FREIGHT_MODEL_ENUM = Object.values(FREIGHT_MODELS);
const ENTITY_ENUM = ['subtrip'];
const VISIBILITY_ENUM = ['required', 'optional', 'hidden'];

const fieldConfigEntrySchema = new Schema(
  {
    visibility: {
      type: String,
      enum: VISIBILITY_ENUM,
      default: 'optional',
    },
    label: { type: String },
  },
  { _id: false }
);

const customerOverrideSchema = new Schema(
  {
    customerId: {
      type: Schema.Types.ObjectId,
      ref: 'Customer',
      required: true,
    },
    fields: {
      type: Map,
      of: fieldConfigEntrySchema,
    },
  },
  { _id: false }
);

const fieldConfigSchema = new Schema(
  {
    tenant: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true,
    },
    entity: {
      type: String,
      enum: ENTITY_ENUM,
      required: true,
    },
    freightConfig: {
      defaultModel: {
        type: String,
        enum: FREIGHT_MODEL_ENUM,
        default: 'per_ton',
      },
      allowedModels: [
        {
          type: String,
          enum: FREIGHT_MODEL_ENUM,
        },
      ],
    },
    fields: {
      type: Map,
      of: fieldConfigEntrySchema,
    },
    customerOverrides: [customerOverrideSchema],
  },
  { timestamps: true }
);

// One config per tenant per entity
fieldConfigSchema.index({ tenant: 1, entity: 1 }, { unique: true });

export default model('FieldConfig', fieldConfigSchema);
