const { Schema, model } = require('mongoose');
const defaults = require('../constants/tenant-config-defaults');

const optionSchema = new Schema(
  {
    label: { type: String, required: true },
    value: { type: String, required: true },
    icon: { type: String },
  },
  { _id: false }
);

const tenantConfigSchema = new Schema(
  {
    tenant: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, unique: true, index: true },
    materialOptions: { type: [optionSchema], default: defaults.materialOptions },
    subtripExpenseTypes: { type: [optionSchema], default: defaults.subtripExpenseTypes },
    vehicleExpenseTypes: { type: [optionSchema], default: defaults.vehicleExpenseTypes },
    // add more configuration categories here as needed
  },
  { timestamps: true }
);

module.exports = model('TenantConfig', tenantConfigSchema);
