import asyncHandler from 'express-async-handler';
import FieldConfig from './fieldConfig.model.js';
import { FIELD_CONFIG_DEFAULTS, VALID_ENTITIES } from './fieldConfig.defaults.js';

/**
 * Converts a stored FieldConfig document (with Mongoose Map) to a plain object
 * for API response, falling back to defaults for missing entities.
 */
const toResponseObject = (doc, entity) => {
  if (!doc) {
    const defaults = FIELD_CONFIG_DEFAULTS[entity];
    return { entity, ...defaults, customerOverrides: [] };
  }
  const obj = doc.toObject();
  // Convert Mongoose Map to plain object for fields
  if (obj.fields instanceof Map) {
    obj.fields = Object.fromEntries(obj.fields);
  }
  // Convert Mongoose Maps in customer overrides
  if (obj.customerOverrides) {
    obj.customerOverrides = obj.customerOverrides.map((override) => ({
      ...override,
      fields: override.fields instanceof Map
        ? Object.fromEntries(override.fields)
        : override.fields,
    }));
  }
  return obj;
};

// @desc    Get field config by entity
// @route   GET /api/field-configs/:entity
// @access  Private
export const getFieldConfig = asyncHandler(async (req, res) => {
  const { entity } = req.params;

  if (!VALID_ENTITIES.includes(entity)) {
    const error = new Error(`Invalid entity: ${entity}`);
    error.status = 400;
    throw error;
  }

  const config = await FieldConfig.findOne({
    tenant: req.tenant,
    entity,
  });

  res.status(200).json(toResponseObject(config, entity));
});

// @desc    Upsert field config for a tenant + entity
// @route   PUT /api/field-configs/:entity
// @access  Private (requires fieldConfig:update)
export const upsertFieldConfig = asyncHandler(async (req, res) => {
  const { entity } = req.params;

  if (!VALID_ENTITIES.includes(entity)) {
    const error = new Error(`Invalid entity: ${entity}`);
    error.status = 400;
    throw error;
  }

  const { fields, freightConfig } = req.body;
  const updateData = {};

  if (fields) updateData.fields = fields;
  if (freightConfig) updateData.freightConfig = freightConfig;

  const config = await FieldConfig.findOneAndUpdate(
    { tenant: req.tenant, entity },
    { $set: updateData },
    { upsert: true, new: true, runValidators: true }
  );

  res.status(200).json(toResponseObject(config, entity));
});

// @desc    Add or update a customer override within a field config
// @route   PUT /api/field-configs/:entity/customer/:customerId
// @access  Private (requires fieldConfig:update)
export const upsertCustomerOverride = asyncHandler(async (req, res) => {
  const { entity, customerId } = req.params;

  if (!VALID_ENTITIES.includes(entity)) {
    const error = new Error(`Invalid entity: ${entity}`);
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
  const updated = await FieldConfig.findOneAndUpdate(
    {
      tenant: req.tenant,
      entity,
      'customerOverrides.customerId': customerId,
    },
    { $set: { 'customerOverrides.$.fields': fields } },
    { new: true, runValidators: true }
  );

  if (updated) {
    return res.status(200).json(toResponseObject(updated, entity));
  }

  // No existing override — push a new one (upsert the parent doc if needed)
  const config = await FieldConfig.findOneAndUpdate(
    { tenant: req.tenant, entity },
    {
      $push: { customerOverrides: { customerId, fields } },
      $setOnInsert: {
        fields: FIELD_CONFIG_DEFAULTS[entity].fields,
        freightConfig: FIELD_CONFIG_DEFAULTS[entity].freightConfig,
      },
    },
    { upsert: true, new: true, runValidators: true }
  );

  res.status(200).json(toResponseObject(config, entity));
});

// @desc    Remove a customer override from a field config
// @route   DELETE /api/field-configs/:entity/customer/:customerId
// @access  Private (requires fieldConfig:update)
export const deleteCustomerOverride = asyncHandler(async (req, res) => {
  const { entity, customerId } = req.params;

  if (!VALID_ENTITIES.includes(entity)) {
    const error = new Error(`Invalid entity: ${entity}`);
    error.status = 400;
    throw error;
  }

  const config = await FieldConfig.findOneAndUpdate(
    { tenant: req.tenant, entity },
    { $pull: { customerOverrides: { customerId } } },
    { new: true }
  );

  if (!config) {
    const error = new Error('Field config not found');
    error.status = 404;
    throw error;
  }

  res.status(200).json(toResponseObject(config, entity));
});
