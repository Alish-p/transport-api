import asyncHandler from 'express-async-handler';
import FormConfig from './formConfig.model.js';
import { FORM_CONFIG_DEFAULTS, VALID_FORM_TYPES } from './formConfig.defaults.js';

/**
 * Converts a stored FormConfig document (with Mongoose Map) to a plain object
 * for API response, falling back to defaults for missing form types.
 */
const toResponseObject = (doc, formType) => {
  if (!doc) {
    const defaults = FORM_CONFIG_DEFAULTS[formType];
    return { formType, ...defaults, customerOverrides: [] };
  }
  const obj = doc.toObject();
  // Convert Mongoose Map to plain object for fields
  if (obj.fields instanceof Map) {
    obj.fields = Object.fromEntries(obj.fields);
  }
  return obj;
};

// @desc    Get all form configs for a tenant (keyed by formType)
// @route   GET /api/form-configs
// @access  Private
export const getAllFormConfigs = asyncHandler(async (req, res) => {
  const configs = await FormConfig.find({ tenant: req.tenant }).lean();

  // Build a map keyed by formType, filling in defaults for missing types
  const result = {};
  for (const formType of VALID_FORM_TYPES) {
    const existing = configs.find((c) => c.formType === formType);
    if (existing) {
      result[formType] = existing;
    } else {
      result[formType] = {
        formType,
        ...FORM_CONFIG_DEFAULTS[formType],
        customerOverrides: [],
      };
    }
  }

  res.status(200).json(result);
});

// @desc    Get a single form config by formType
// @route   GET /api/form-configs/:formType
// @access  Private
export const getFormConfig = asyncHandler(async (req, res) => {
  const { formType } = req.params;

  if (!VALID_FORM_TYPES.includes(formType)) {
    const error = new Error(`Invalid form type: ${formType}`);
    error.status = 400;
    throw error;
  }

  const config = await FormConfig.findOne({
    tenant: req.tenant,
    formType,
  });

  res.status(200).json(toResponseObject(config, formType));
});

// @desc    Upsert form config for a tenant + formType
// @route   PUT /api/form-configs/:formType
// @access  Private (requires formConfig:update)
export const upsertFormConfig = asyncHandler(async (req, res) => {
  const { formType } = req.params;

  if (!VALID_FORM_TYPES.includes(formType)) {
    const error = new Error(`Invalid form type: ${formType}`);
    error.status = 400;
    throw error;
  }

  const { fields, freightConfig } = req.body;
  const updateData = {};

  if (fields) updateData.fields = fields;
  if (freightConfig) updateData.freightConfig = freightConfig;

  const config = await FormConfig.findOneAndUpdate(
    { tenant: req.tenant, formType },
    { $set: updateData },
    { upsert: true, new: true, runValidators: true }
  );

  res.status(200).json(toResponseObject(config, formType));
});

// @desc    Add or update a customer override within a form config
// @route   PUT /api/form-configs/:formType/customer/:customerId
// @access  Private (requires formConfig:update)
export const upsertCustomerOverride = asyncHandler(async (req, res) => {
  const { formType, customerId } = req.params;

  if (!VALID_FORM_TYPES.includes(formType)) {
    const error = new Error(`Invalid form type: ${formType}`);
    error.status = 400;
    throw error;
  }

  const { fields } = req.body;
  if (!fields || Object.keys(fields).length === 0) {
    const error = new Error('Fields are required for customer override');
    error.status = 400;
    throw error;
  }

  // Try to update an existing override first
  const updated = await FormConfig.findOneAndUpdate(
    {
      tenant: req.tenant,
      formType,
      'customerOverrides.customerId': customerId,
    },
    { $set: { 'customerOverrides.$.fields': fields } },
    { new: true, runValidators: true }
  );

  if (updated) {
    return res.status(200).json(toResponseObject(updated, formType));
  }

  // No existing override — push a new one (upsert the parent doc if needed)
  const config = await FormConfig.findOneAndUpdate(
    { tenant: req.tenant, formType },
    {
      $push: { customerOverrides: { customerId, fields } },
      $setOnInsert: {
        fields: FORM_CONFIG_DEFAULTS[formType].fields,
        freightConfig: FORM_CONFIG_DEFAULTS[formType].freightConfig,
      },
    },
    { upsert: true, new: true, runValidators: true }
  );

  res.status(200).json(toResponseObject(config, formType));
});

// @desc    Remove a customer override from a form config
// @route   DELETE /api/form-configs/:formType/customer/:customerId
// @access  Private (requires formConfig:update)
export const deleteCustomerOverride = asyncHandler(async (req, res) => {
  const { formType, customerId } = req.params;

  if (!VALID_FORM_TYPES.includes(formType)) {
    const error = new Error(`Invalid form type: ${formType}`);
    error.status = 400;
    throw error;
  }

  const config = await FormConfig.findOneAndUpdate(
    { tenant: req.tenant, formType },
    { $pull: { customerOverrides: { customerId } } },
    { new: true }
  );

  if (!config) {
    const error = new Error('Form config not found');
    error.status = 404;
    throw error;
  }

  res.status(200).json(toResponseObject(config, formType));
});
