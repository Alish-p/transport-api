import httpStatus from 'http-status';

class ApiError extends Error {
  constructor(statusCode, message, isOperational = true, stack = "") {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    if (stack) {
      this.stack = stack;
    } else {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

const validateZod = (schema) => (req, res, next) => {
  try {
    const result = schema.parse({
      body: req.body,
      query: req.query,
      params: req.params,
    });
    req.body = result.body;
    req.query = result.query;
    req.params = result.params;
    return next();
  } catch (error) {
    const message =
      error.errors
        ?.map((e) => `${e.path.join(".")}: ${e.message}`)
        .join(", ") || "Invalid request";

    return next(new ApiError(httpStatus.BAD_REQUEST, message));
  }
};

export default validateZod;
