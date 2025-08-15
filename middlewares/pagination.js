const pagination = (req, res, next) => {
  const page = parseInt(req.query.page, 10) || 1;
  const rowsPerPage = parseInt(req.query.rowsPerPage, 10) || 10;

  const limit = rowsPerPage;
  const skip = (page - 1) * limit;

  req.pagination = { page, rowsPerPage, limit, skip };

  next();
};

export default pagination;
