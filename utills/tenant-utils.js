function addTenantToQuery(req, query = {}) {
  return { ...query, tenant: req.tenant };
}
export { addTenantToQuery };
