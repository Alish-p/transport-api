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

  const message = err.message && !err.message.includes('E11000')
    ? err.message
    : duplicateFields
      ? `Value already exists for ${duplicateFields}. Please use another value.`
      : 'Value already exists. Please use another value.';
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

const errorHandler = (err, req, res, next) => {
  console.log(err.message);

  if (err.name === "CastError") err = handleCastErrorDB(err);
  if (err.code === 11000) err = handleDuplicateFieldsDB(err);
  if (err.name === "ValidationError") err = handleValidationErrorDB(err);

  const { status, message } = err;

  const stack = process.env.NODE_ENV === "production" ? null : err.stack;

  res.status(status || 500).json({ message, stack, handled: true });
};

export { notFound, errorHandler };
