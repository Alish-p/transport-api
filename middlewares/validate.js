import httpStatus from 'http-status';

const validate = (schema) => (req, res, next) => {
  const result = schema.safeParse({
    body: req.body,
    params: req.params,
    query: req.query,
  });

  if (!result.success) {
    const errorMessage = result.error.errors.map((err) => err.message).join(', ');
    const error = new Error(errorMessage);
    error.status = httpStatus.BAD_REQUEST;
    return next(error);
  }

  Object.assign(req, result.data);
  return next();
};

export default validate;
