/**
 * Recursively converts nested objects into MongoDB dot-notation paths.
 * Leaves arrays, Dates, nulls, and designated leaf objects (like Map payloads) intact.
 */
function toDotNotation(obj, prefix = '', customLeafKeys = ['fields']) {
  const result = {};

  if (!obj || typeof obj !== 'object') {
    return result;
  }

  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) continue;

    const fullKey = prefix ? `${prefix}.${key}` : key;

    const isLeaf =
      value === null ||
      typeof value !== 'object' ||
      Array.isArray(value) ||
      value instanceof Date ||
      customLeafKeys.includes(key);

    if (isLeaf) {
      result[fullKey] = value;
    } else {
      Object.assign(result, toDotNotation(value, fullKey, customLeafKeys));
    }
  }

  return result;
}

function addTenantToQuery(req, query = {}) {
  return { ...query, tenant: req.tenant };
}

export { toDotNotation, addTenantToQuery };
