import FieldConfig from './fieldConfig.model.js';
import { FIELD_CONFIG_DEFAULTS } from './fieldConfig.defaults.js';

/**
 * Merges base field configs with customer-specific overrides.
 * Override fields take precedence over base fields.
 *
 * @param {Object} baseFields - Base field configuration (plain object or Map)
 * @param {Object} overrideFields - Customer-specific overrides (plain object or Map)
 * @returns {Object} Merged field configuration
 */
export const mergeFieldConfigs = (baseFields, overrideFields) => {
  // Normalize Maps to plain objects
  const base = baseFields instanceof Map
    ? Object.fromEntries(baseFields)
    : { ...baseFields };

  if (!overrideFields) return base;

  const overrides = overrideFields instanceof Map
    ? Object.fromEntries(overrideFields)
    : overrideFields;

  // Spread override values on top of base
  for (const [key, value] of Object.entries(overrides)) {
    base[key] = { ...base[key], ...value };
  }

  return base;
};

/**
 * Resolves the effective field config for a tenant + entity + optional customer.
 * Falls back to FIELD_CONFIG_DEFAULTS if no DB config exists.
 */
const resolveFieldConfig = async (tenantId, entity, customerId) => {
  const config = await FieldConfig.findOne({ tenant: tenantId, entity });

  // Fall back to defaults if no config exists
  const defaults = FIELD_CONFIG_DEFAULTS[entity];
  if (!config) {
    return {
      fields: { ...defaults.fields },
      freightConfig: { ...defaults.freightConfig },
    };
  }

  let baseFields = config.fields instanceof Map
    ? Object.fromEntries(config.fields)
    : { ...config.fields };

  // Apply customer override if applicable
  if (customerId && config.customerOverrides?.length) {
    const override = config.customerOverrides.find(
      (o) => o.customerId.toString() === customerId.toString()
    );
    if (override) {
      baseFields = mergeFieldConfigs(baseFields, override.fields);
    }
  }

  const freightConfig = config.freightConfig || defaults.freightConfig;

  return { fields: baseFields, freightConfig };
};

/**
 * Express middleware factory for field config validation.
 * Validates required fields, strips hidden fields, and checks freight model.
 *
 * @param {string} entity - One of the valid entities (e.g. 'subtrip')
 * @returns {Function} Express middleware
 */
export const validateFieldConfig = (entity) => async (req, res, next) => {
  try {
    const customerId = req.body.customerId || req.body.customer;
    const { fields, freightConfig } = await resolveFieldConfig(
      req.tenant,
      entity,
      customerId
    );

    const errors = [];

    // Validate each configured field
    for (const [fieldName, fieldConfig] of Object.entries(fields)) {
      const { visibility } = fieldConfig;

      if (visibility === 'required') {
        // Skip required validation for loaded-only fields on empty subtrips
        if (
          entity === 'subtrip' &&
          req.body.isEmpty &&
          !['loadingPoint', 'unloadingPoint', 'remarks'].includes(fieldName)
        ) {
          continue;
        }

        const value = req.body[fieldName];
        if (value === undefined || value === null || value === '') {
          const label = fieldConfig.label || fieldName;
          errors.push(`${label} is required`);
        }
      }

      // Defense in depth: strip hidden fields from the request body
      if (visibility === 'hidden') {
        delete req.body[fieldName];
      }
    }

    // Validate freight model if applicable
    if (freightConfig?.allowedModels?.length) {
      const freightModel =
        req.body.freightDetails?.freightModel || req.body.freightModel;

      if (freightModel && !freightConfig.allowedModels.includes(freightModel)) {
        errors.push(
          `Freight model "${freightModel}" is not allowed. Allowed: ${freightConfig.allowedModels.join(', ')}`
        );
      }
    }

    if (errors.length) {
      const error = new Error(errors.join(', '));
      error.status = 400;
      return next(error);
    }

    // Attach resolved config to request for downstream use
    req.fieldConfig = { fields, freightConfig };
    next();
  } catch (err) {
    next(err);
  }
};
