import { model, Schema } from 'mongoose';

import defaults from './tenant.constants.js';

const paymentHistorySchema = new Schema({
  amount: { type: Number, required: true, min: 0 },
  paymentDate: { type: Date, required: true },
  paymentMethod: {
    type: String,
    enum: ["UPI", "Card", "BankTransfer", "Cash"],
    required: true,
  },
  status: {
    type: String,
    enum: ["SUCCESS", "FAILED", "PENDING"],
    default: "PENDING",
  },
  notes: String,
});

const integrationSchema = new Schema(
  {
    whatsapp: {
      enabled: { type: Boolean, default: false },
      config: { type: Schema.Types.Mixed },
    },
    vehicleGPS: {
      enabled: { type: Boolean, default: false },
      provider: {
        type: String,
        enum: ["Fleetx", "LocoNav", "BlackBuck", "Other"],
        default: null,
      },
      config: { type: Schema.Types.Mixed },
    },
    vehicleApi: {
      enabled: { type: Boolean, default: false },
      config: { type: Schema.Types.Mixed },
    },
    // Traffic eChallan integration (webcorevision provider)
    challanApi: {
      enabled: { type: Boolean, default: false },
      config: { type: Schema.Types.Mixed },
    },
    // Fetch company details by GST (webcorevision provider)
    gstApi: {
      enabled: { type: Boolean, default: false },
      config: { type: Schema.Types.Mixed },
    },
    ewayBill: {
      enabled: { type: Boolean, default: false },
      username: { type: String, default: '' },
      password: { type: String, default: '' },
    },
    accounting: {
      enabled: { type: Boolean, default: false },
      provider: {
        type: String,
        enum: ["Tally", "Mark", "Zoho"],
        default: null,
      },
      config: {
        invoiceLedgerNames: {
          enabled: { type: Boolean, default: false },
          cgst: { type: String },
          igst: { type: String },
          sgst: { type: String },
          transport_pay: { type: String },
          shortage: { type: String },
        },
        transporterLedgerNames: {
          enabled: { type: Boolean, default: false },
          cgst: { type: String },
          igst: { type: String },
          sgst: { type: String },
          tds: { type: String },
          diesel: { type: String },
          trip_advance: { type: String },
          shortage: { type: String },
        },
      },
    },
    maintenanceAndInventory: {
      enabled: { type: Boolean, default: false },
    },
    tyre: {
      enabled: { type: Boolean, default: false },
      config: { type: Schema.Types.Mixed },
    },
    epod: {
      enabled: { type: Boolean, default: false },
    },
  },
  { _id: false }
);

const optionSchema = new Schema(
  {
    label: { type: String, required: true },
    value: { type: String, required: true },
    icon: { type: String },
  },
  { _id: false }
);

const tenantSchema = new Schema(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    tagline: String,
    theme: String,
    // Branding
    logoKey: { type: String, default: null }, // S3 object key for logo
    logoUrl: { type: String, default: null }, // Public URL (CloudFront/CDN or S3 public)
    logoUpdatedAt: { type: Date, default: null },
    address: {
      line1: { type: String, required: true },
      line2: String,
      state: { type: String, required: true },
      city: { type: String, required: true },
      pincode: { type: String, required: true },
    },
    contactDetails: {
      email: { type: String, required: true },
      phone: { type: String },
      website: String,
    },
    legalInfo: {
      panNumber: String,
      gstNumber: String,
      registeredState: String,
    },
    bankDetails: {
      name: String,
      branch: String,
      ifsc: String,
      place: String,
      accNo: String,
    },
    subscription: {
      planName: String,
      validTill: Date,
      isActive: Boolean,
      createdAt: Date,
      updatedAt: Date,
    },
    config: {
      vehicle: {
        marketVehicles: { type: Boolean, default: true },
        types: {
          type: [optionSchema],
          default: defaults.vehicle.types,
        },
        companies: {
          type: [optionSchema],
          default: defaults.vehicle.companies,
        },
        models: {
          type: [optionSchema],
          default: defaults.vehicle.models,
        },
        engineTypes: {
          type: [optionSchema],
          default: defaults.vehicle.engineTypes,
        },
      },
      subtrip: {
        materialOptions: {
          type: [optionSchema],
          default: defaults.subtrip.materialOptions,
        },
      },
      expense: {
        'subtrip-expense-types': {
          type: [optionSchema],
          default: defaults.expense['subtrip-expense-types'],
        },
        'vehicle-expense-types': {
          type: [optionSchema],
          default: defaults.expense['vehicle-expense-types'],
        },
      },
      invoice: {
        defaultDueInDays: { type: Number, default: 10 },
        defaultTaxRates: {
          cgst: { type: Number, default: 0 },
          sgst: { type: Number, default: 0 },
          igst: { type: Number, default: 0 },
        },
        termsAndConditions: { type: String, default: '' },
      },
      transporterPayment: {
        defaultTdsPercentage: { type: Number, default: 2 },
        defaultPodCharges: { type: Number, default: 0 },
        template: { type: String, default: 'standard' },
      },
      pump: {
        enabled: { type: Boolean, default: true },
      },
    },
    integrations: {
      type: integrationSchema,
      default: () => ({}),
    },
    paymentHistory: [paymentHistorySchema],
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default model("Tenant", tenantSchema);
