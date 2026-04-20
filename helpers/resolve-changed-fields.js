import Driver from '../entities/driver/driver.model.js';
import Customer from '../entities/customer/customer.model.js';
import Vehicle from '../entities/vehicle/vehicle.model.js';
import Pump from '../entities/pump/pump.model.js';
import Trip from '../entities/trip/trip.model.js';

/**
 * Maps subtrip field names that hold ObjectId refs to:
 *   - displayKey : the friendly label shown in the timeline (no "Id" suffix)
 *   - model      : the Mongoose model to look up
 *   - labelField : the field on that model that contains the human-readable value
 */
const REF_FIELD_CONFIG = {
  driverId:      { displayKey: 'driver',   model: Driver,   labelField: 'driverName'   },
  customerId:    { displayKey: 'customer', model: Customer, labelField: 'customerName' },
  vehicleId:     { displayKey: 'vehicle',  model: Vehicle,  labelField: 'vehicleNo'    },
  intentFuelPump:{ displayKey: 'pump',     model: Pump,     labelField: 'name'         },
  tripId:        { displayKey: 'trip',     model: Trip,     labelField: 'tripNo'       },
};

/**
 * Given a changedFields object (already serialized to primitives via buildChangedFields),
 * replace raw ObjectId strings for known ref fields with their human-readable labels,
 * and rename the key to the friendly display name.
 *
 * Non-ref fields are left untouched.
 *
 * @param {Object} changedFields  - Output of buildChangedFields()
 * @param {string} tenant         - req.tenant (for scoped lookups)
 * @returns {Promise<Object>}     - Resolved changedFields map ready for storage
 */
const resolveChangedFieldLabels = async (changedFields, tenant) => {
  const resolved = {};

  await Promise.all(
    Object.entries(changedFields).map(async ([field, change]) => {
      const config = REF_FIELD_CONFIG[field];

      if (!config) {
        // Not a ref field – keep as-is
        resolved[field] = change;
        return;
      }

      const { displayKey, model, labelField } = config;

      // Fetch labels for both from/to IDs in parallel (skip null/undefined)
      const [fromLabel, toLabel] = await Promise.all([
        lookupLabel(model, change.from, labelField, tenant),
        lookupLabel(model, change.to,   labelField, tenant),
      ]);

      resolved[displayKey] = { from: fromLabel, to: toLabel };
    })
  );

  return resolved;
};

/**
 * Look up the human-readable label for a given ID.
 * Falls back to the raw ID string if the document is not found.
 *
 * @param {Model}  model       - Mongoose model
 * @param {string} id          - ObjectId string (may be null/undefined)
 * @param {string} labelField  - Field name to extract from the document
 * @param {string} tenant      - Tenant scope for the query
 * @returns {Promise<string|null>}
 */
const lookupLabel = async (model, id, labelField, tenant) => {
  if (!id) return null;
  try {
    const doc = await model.findOne({ _id: id, tenant }).select(labelField).lean();
    return doc?.[labelField] ?? id; // Fallback to raw id if not found
  } catch {
    return id; // Never throw – fallback to id
  }
};

export { resolveChangedFieldLabels };
