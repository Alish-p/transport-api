import { FREIGHT_MODELS as SUBTRIP_FREIGHT_MODELS } from '../subtrip/subtrip.constants.js';

export const FREIGHT_MODELS = Object.values(SUBTRIP_FREIGHT_MODELS);

export const FORM_CONFIG_DEFAULTS = {
  job_create: {
    freightConfig: {
      defaultModel: SUBTRIP_FREIGHT_MODELS.PER_TON,
      allowedModels: FREIGHT_MODELS,
    },
    fields: {
      // These match current hardcoded behavior of the app
      invoiceNo: { visibility: 'required', label: 'Invoice No' },
      ewayBill: { visibility: 'optional', label: 'Eway Bill' },
      ewayExpiryDate: { visibility: 'optional', label: 'Eway Expiry Date321' },
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
    },
  },
  job_edit: {
    freightConfig: {
      defaultModel: SUBTRIP_FREIGHT_MODELS.PER_TON,
      allowedModels: FREIGHT_MODELS,
    },
    fields: {
      // ALL fields from create + receive
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
      rate: { visibility: 'required', label: 'Rate' },
      commissionRate: { visibility: 'optional', label: 'Commission Rate' },
      commissionAmount: { visibility: 'optional', label: 'Commission Amount' },
      unloadingWeight: { visibility: 'optional', label: 'Unloading Weight' },
      endKm: { visibility: 'optional', label: 'End KM' },
      endTime: { visibility: 'optional', label: 'End Time' },
      freightAmountOverride: { visibility: 'optional', label: 'Freight Amount Override' },
      shortageWeight: { visibility: 'optional', label: 'Shortage Weight' },
      shortageAmount: { visibility: 'optional', label: 'Shortage Amount' },
    },
  },
  job_receive: {
    freightConfig: {
      defaultModel: SUBTRIP_FREIGHT_MODELS.PER_TON,
      allowedModels: FREIGHT_MODELS,
    },
    fields: {
      unloadingWeight: { visibility: 'required', label: 'Unloading Weight' },
      endKm: { visibility: 'optional', label: 'End KM' },
      endTime: { visibility: 'optional', label: 'End Time' },
      commissionRate: { visibility: 'optional', label: 'Commission Rate' },
      commissionAmount: { visibility: 'optional', label: 'Commission Amount' },
      freightAmountOverride: { visibility: 'optional', label: 'Freight Amount Override' },
      shortageWeight: { visibility: 'optional', label: 'Shortage Weight' },
      shortageAmount: { visibility: 'optional', label: 'Shortage Amount' },
      remarks: { visibility: 'optional', label: 'Remarks' },
    },
  },
};

export const VALID_FORM_TYPES = Object.keys(FORM_CONFIG_DEFAULTS);
