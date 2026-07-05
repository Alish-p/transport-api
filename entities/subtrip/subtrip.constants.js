export const FREIGHT_MODELS = {
  PER_TON: 'per_ton',
  PER_KL: 'per_kl',
  PER_KM: 'per_km',
  FIXED: 'fixed',
  PER_HOUR: 'per_hour',
  HYBRID: 'hybrid',
};

export const SUBTRIP_STATUS = {
  IN_QUEUE: 'in-queue',
  LOADED: 'loaded',
  ERROR: 'error',
  RECEIVED: 'received',
  BILLED: 'billed',
};

export const SUBTRIP_EXPENSE_TYPES = {
  DIESEL: 'diesel',
  ADBLUE: 'adblue',
  DRIVER_SALARY: 'driver-salary',
  TRIP_ADVANCE: 'trip-advance',
  TRIP_EXTRA_ADVANCE: 'trip-extra-advance',
  TYRE_PUNCHER: 'puncher',
  TYRE_EXPENSE: 'tyre-expense',
  POLICE: 'police',
  RTO: 'rto',
  TOLL: 'toll',
  VEHICLE_REPAIR: 'vehicle-repair',
  OTHER: 'other',
};

export const DRIVER_ADVANCE_GIVEN_BY_OPTIONS = {
  SELF: 'Self',
  FUEL_PUMP: 'Fuel Pump',
};

export const FIELD_CONFIG_DEFAULTS = {
  subtrip: {
    defaultFreightModel: FREIGHT_MODELS.PER_TON,
    allowedFreightModels: Object.values(FREIGHT_MODELS),
    fields: {
      invoiceNo: { visibility: 'required', label: 'Invoice No' },
      vehicleAssignment: { visibility: 'hidden', label: 'Vehicle Assignment' },
      ewayBill: { visibility: 'optional', label: 'Eway Bill' },
      ewayExpiryDate: { visibility: 'optional', label: 'Eway Expiry Date' },
      shipmentNo: { visibility: 'optional', label: 'Shipment No' },
      orderNo: { visibility: 'optional', label: 'Order No' },
      referenceSubtripNo: { visibility: 'optional', label: 'Reference Job No' },
      diNumber: { visibility: 'optional', label: 'DI/DO No' },
      consignee: { visibility: 'required', label: 'Consignee' },
      loadingPoint: { visibility: 'required', label: 'Loading Point' },
      unloadingPoint: { visibility: 'required', label: 'Unloading Point' },
      materialType: { visibility: 'required', label: 'Material Type' },
      grade: { visibility: 'optional', label: 'Grade' },
      quantity: { visibility: 'optional', label: 'Quantity' },
      remarks: { visibility: 'optional', label: 'Remarks' },
    },
  },
};
