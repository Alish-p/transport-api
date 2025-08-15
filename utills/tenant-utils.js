function addTenantToQuery(req, query = {}) {
  return { ...query, tenant: req.tenant };
}
module.exports = { addTenantToQuery };
