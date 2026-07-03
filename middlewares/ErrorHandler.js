// DIFFERENT ERROR HANDLER
const handleCastErrorDB = (err) => {
  console.log("Cast error");
  const message = `Invalid ${err.path}: ${err.value}`;
  const error = new Error(message);
  error.status = 404;
  return error;
};

const handleDuplicateFieldsDB = (err) => {
  console.log("Duplicate error");
  const duplicateFields = err.keyValue
    ? Object.entries(err.keyValue)
        .map(([field, value]) => `${field}: "${value}"`)
        .join(', ')
    : null;

  let message = 'Value already exists. Please use another value.';
  const { message: errMessage } = err;
  if (errMessage && !errMessage.includes('E11000')) {
    message = errMessage;
  } else if (duplicateFields) {
    message = `Value already exists for ${duplicateFields}. Please use another value.`;
  }
  const error = new Error(message);
  error.status = 400;
  return error;
};

const handleValidationErrorDB = (err) => {
  console.log("Validation Error");
  const errors = Object.values(err.errors).map((el) => el.message);

  const message = `Invalid input data. ${errors.join(". ")}`;
  const error = new Error(message);
  error.status = 400;
  return error;
};

// middleware
const notFound = (req, res, next) => {
  const err = new Error("Page not found");
  err.status = 404;
  next(err);
};

// errorHandler

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  console.log(err.message);

  let error = err;
  if (err.name === "CastError") error = handleCastErrorDB(err);
  if (err.code === 11000) error = handleDuplicateFieldsDB(err);
  if (err.name === "ValidationError") error = handleValidationErrorDB(err);

  const { status, message } = error;

  const stack = process.env.NODE_ENV === "production" ? null : error.stack;

  res.status(status || 500).json({ message, stack, handled: true });
};

export { notFound, errorHandler };
