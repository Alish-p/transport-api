exports.INVOICE_STATUS = {
  PENDING: "pending",
  PAID: "paid",
  OVERDUE: "overdue",
};

exports.SUBTRIP_STATUS = {
  IN_QUEUE: "in-queue",
  LOADED: "loaded",
  ERROR: "error",
  RECEIVED: "received",
  BILLED_PENDING: "billed-pending",
  BILLED_OVERDUE: "billed-overdue",
  BILLED_PAID: "billed-paid",
};

exports.SUBTRIP_EXPENSE_TYPES = {
  DIESEL: "diesel",
  ADBLUE: "adblue",
  DRIVER_SALARY: "driver-salary",
  TRIP_ADVANCE: "trip-advance",
  TRIP_EXTRA_ADVANCE: "trip-extra-advance",
  TYRE_PUNCHER: "puncher",
  TYRE_EXPENSE: "tyre-expense",
  POLICE: "police",
  RTO: "rto",
  TOLL: "toll",
  VEHICLE_REPAIR: "vehicle-repair",
  OTHER: "other",
};

exports.VEHICLE_EXPENSE_TYPES = {
  INSURANCE: "insurance",
  PERMIT: "permit",
  PASSING: "passing",
  TYRE: "tyre",
  MAJOR_REPAIR: "major-repair",
  FITNESS_CERTIFICATE: "fitness-certificate",
  OVER_LOAD_FEES: "over-load-fees",
  OTHER: "other",
};

exports.EXPENSE_CATEGORIES = {
  VEHICLE: "vehicle",
  SUBTRIP: "subtrip",
};
