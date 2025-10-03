import { Schema, model } from 'mongoose';
import defaults from './tenant.constants.js';

const paymentHistorySchema = new Schema(
  {
    amount: { type: Number, required: true },
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
  },
  { _id: false }
);

const integrationSchema = new Schema(
  {
    whatsapp: {
      enabled: { type: Boolean, default: false },
      provider: {
        type: String,
        enum: ["Twilio", "Gupshup", "Kaleyra"],
        default: null,
      },
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
      bankName: String,
      accountNumber: String,
      ifscCode: String,
    },
    subscription: {
      planName: String,
      validTill: Date,
      isActive: Boolean,
      createdAt: Date,
      updatedAt: Date,
    },
    config: {
      materialOptions: {
        type: [optionSchema],
        default: defaults.materialOptions,
      },
      subtripExpenseTypes: {
        type: [optionSchema],
        default: defaults.subtripExpenseTypes,
      },
      vehicleExpenseTypes: {
        type: [optionSchema],
        default: defaults.vehicleExpenseTypes,
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
