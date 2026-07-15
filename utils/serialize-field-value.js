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
 * Returns true for plain JS / Mongoose subdocument objects that should be
 * recursed into for leaf-level diffs.
 * Excludes ObjectIds, Dates, Arrays, and null.
 */
const isPlainObject = (val) =>
  val !== null &&
  typeof val === 'object' &&
  !Array.isArray(val) &&
  !(val instanceof Date) &&
  val.constructor?.name !== 'ObjectId';

/**
 * Recursively collect changed leaf values from two objects, emitting
 * flat dot-notation keys into the `out` map.
 *
 * @param {Object}  oldObj  - The "before" object (or Mongoose doc)
 * @param {Object}  newObj  - The "after" object (from req.body)
 * @param {Object}  out     - Accumulator: { [dotKey]: { from, to } }
 * @param {string}  prefix  - Current dot-notation path prefix
 */
const collectLeafDiffs = (oldObj, newObj, out, prefix = '') => {
  const keys = new Set([
    ...Object.keys(oldObj ?? {}),
    ...Object.keys(newObj ?? {}),
  ]);

  for (const key of keys) {
    const path = prefix ? `${prefix}.${key}` : key;
    const oldVal = oldObj?.[key];
    const newVal = newObj?.[key];

    if (isPlainObject(oldVal) || isPlainObject(newVal)) {
      // Recurse one level deeper
      collectLeafDiffs(
        isPlainObject(oldVal) ? oldVal : {},
        isPlainObject(newVal) ? newVal : {},
        out,
        path
      );
    } else {
      const isDateField = DATE_FIELDS.has(key);
      const serializedOld = serializeFieldValue(oldVal, isDateField);
      const serializedNew = serializeFieldValue(newVal, isDateField);

      if (String(serializedOld) !== String(serializedNew)) {
        out[path] = { from: serializedOld, to: serializedNew };
      }
    }
  }
};

/**
 * Build a changedFields map suitable for storing in a SubtripEvent details object.
 *
 * - Primitive fields are compared directly.
 * - Plain object fields (e.g. freightDetails, commissionDetails) are recursed
 *   into, emitting one dot-notation entry per changed leaf value.
 * - ObjectId, Date, and Array fields are serialized and compared as primitives.
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

    if (isPlainObject(oldVal) || isPlainObject(newVal)) {
      // Recurse into nested objects for leaf-level diffs
      collectLeafDiffs(
        isPlainObject(oldVal) ? oldVal : {},
        isPlainObject(newVal) ? newVal : {},
        changedFields,
        key
      );
    } else {
      const isDateField = DATE_FIELDS.has(key);
      const serializedOld = serializeFieldValue(oldVal, isDateField);
      const serializedNew = serializeFieldValue(newVal, isDateField);

      if (String(serializedOld) !== String(serializedNew)) {
        changedFields[key] = { from: serializedOld, to: serializedNew };
      }
    }
  });

  return changedFields;
};
