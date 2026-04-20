import { fDate } from './time-utils.js';

/**
 * Known date fields on the Subtrip model.
 * String values from req.body for these keys will also be formatted as dates.
 */
const DATE_FIELDS = new Set([
  'startDate', 'endDate', 'ewayExpiryDate', 'podSignedAt',
]);

/**
 * Format any date-like value (Date object or parseable date string) to a
 * human-readable IST timestamp, e.g. "20 Apr 2026 9:22 pm".
 * Returns the original value if not a valid date.
 */
const formatDate = (val) => {
  if (!val) return val;
  const d = val instanceof Date ? val : new Date(val);
  if (Number.isNaN(d.getTime())) return val;
  return fDate(d); // "DD MMM YYYY" in IST
};

/**
 * Safely convert a Mongoose field value to a primitive suitable for storing in
 * Schema.Types.Mixed fields (e.g. subtripEvent.details.changedFields).
 *
 * Handles:
 *   - Date objects       -> formatted IST string ("20 Apr 2026 9:22 pm")
 *   - Mongoose ObjectId  -> id string
 *   - Populated doc      -> _id string
 *   - null / undefined   -> returned as-is
 *   - primitives         -> returned as-is
 *   - other objects      -> JSON string (best-effort)
 *
 * @param {any}     val         - The value to serialize
 * @param {boolean} isDateField - If true, string values are also formatted as dates
 */
export const serializeFieldValue = (val, isDateField = false) => {
  if (val === null || val === undefined) return val;
  if (val instanceof Date) return formatDate(val);
  if (typeof val === 'object') {
    if (val.constructor?.name === 'ObjectId') return val.toString();
    if (val._id) return val._id.toString();
    try { return JSON.stringify(val); } catch { return String(val); }
  }
  // For known date fields, parse and format the incoming string from req.body
  if (isDateField && typeof val === 'string') return formatDate(val);
  return val; // string, number, boolean
};

/**
 * Build a changedFields map suitable for storing in a SubtripEvent details object.
 * Compares values loosely (via String coercion) to handle ObjectId vs string mismatches.
 *
 * @param {Object}   existingDoc - The Mongoose document before the update
 * @param {Object}   incoming    - The plain object from req.body (or any patch)
 * @param {string[]} [skip=[]]   - Field keys to exclude (e.g. internal flags)
 * @returns {{ [field: string]: { from: any, to: any } }}
 */
export const buildChangedFields = (existingDoc, incoming, skip = []) => {
  const changedFields = {};

  Object.keys(incoming).forEach((key) => {
    if (skip.includes(key)) return;

    const oldVal = existingDoc[key];
    const newVal = incoming[key];

    if (String(oldVal) !== String(newVal)) {
      const isDateField = DATE_FIELDS.has(key);
      changedFields[key] = {
        from: serializeFieldValue(oldVal, isDateField),
        to:   serializeFieldValue(newVal, isDateField),
      };
    }
  });

  return changedFields;
};

