import { FREIGHT_MODELS as SUBTRIP_FREIGHT_MODELS } from '../subtrip/subtrip.constants.js';

export const FREIGHT_MODELS = Object.values(SUBTRIP_FREIGHT_MODELS);

export const VALID_ENTITIES = ['subtrip'];

export const FIELD_CONFIG_DEFAULTS = {
  subtrip: {
    freightConfig: {
      defaultModel: SUBTRIP_FREIGHT_MODELS.PER_TON,
      allowedModels: FREIGHT_MODELS,
    },
    fields: {
      // Job creation fields
      invoiceNo: { visibility: 'required', label: 'Invoice No' },
      ewayBill: { visibility: 'optional', label: 'Eway Bill' },
      ewayExpiryDate: { visibility: 'optional', label: 'Eway Expiry Date' },
      shipmentNo: { visibility: 'optional', label: 'Shipment No' },
      orderNo: { visibility: 'optional', label: 'Order No' },
      referenceSubtripNo: { visibility: 'optional', label: 'Reference Job No' },
      diNumber: { visibility: 'optional', label: 'DI/DO No' },
      consignee: { visibility: 'required', label: 'Consignee' },
      loadingPoint: { visibility: 'required', label: 'Loading Point' },
      unloadingPoint: { visibility: 'required', label: 'Unloading Point' },
      loadingWeight: { visibility: 'required', label: 'Loading Weight' },
      materialType: { visibility: 'required', label: 'Material Type' },
      grade: { visibility: 'optional', label: 'Grade' },
      quantity: { visibility: 'optional', label: 'Quantity' },
      startKm: { visibility: 'optional', label: 'Start KM' },
      remarks: { visibility: 'optional', label: 'Remarks' },
      // Receive/edit fields
      rate: { visibility: 'required', label: 'Rate' },
      unloadingWeight: { visibility: 'required', label: 'Unloading Weight' },
      endKm: { visibility: 'optional', label: 'End KM' },
      endTime: { visibility: 'optional', label: 'End Time' },
      commissionRate: { visibility: 'optional', label: 'Commission Rate' },
      commissionAmount: { visibility: 'optional', label: 'Commission Amount' },
      freightAmountOverride: { visibility: 'optional', label: 'Freight Amount Override' },
      shortageWeight: { visibility: 'optional', label: 'Shortage Weight' },
      shortageAmount: { visibility: 'optional', label: 'Shortage Amount' },
    },
  },
};
