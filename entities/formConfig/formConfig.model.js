import { Schema, model } from 'mongoose';
import { FREIGHT_MODELS } from '../subtrip/subtrip.constants.js';

const FREIGHT_MODEL_ENUM = Object.values(FREIGHT_MODELS);
const FORM_TYPE_ENUM = ['job_create', 'job_edit', 'job_receive'];
const VISIBILITY_ENUM = ['required', 'optional', 'hidden'];

const fieldConfigSchema = new Schema(
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
      of: fieldConfigSchema,
    },
  },
  { _id: false }
);

const formConfigSchema = new Schema(
  {
    tenant: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true,
    },
    formType: {
      type: String,
      enum: FORM_TYPE_ENUM,
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
      of: fieldConfigSchema,
    },
    customerOverrides: [customerOverrideSchema],
  },
  { timestamps: true }
);

// One config per tenant per form type
formConfigSchema.index({ tenant: 1, formType: 1 }, { unique: true });

export default model('FormConfig', formConfigSchema);
