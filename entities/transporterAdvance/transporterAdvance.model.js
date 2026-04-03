import { Schema, model } from 'mongoose';
import { ADVANCE_TYPES } from './transporterAdvance.constants.js';

const transporterAdvanceSchema = new Schema(
  {
    subtripId: {
      type: Schema.Types.ObjectId,
      ref: 'Subtrip',
      required: true,
      index: true,
    },
    vehicleId: {
      type: Schema.Types.ObjectId,
      ref: 'Vehicle',
    },
    advanceType: {
      type: String,
      enum: ADVANCE_TYPES,
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      set: (v) => Math.round(v * 100) / 100,
      get: (v) => Math.round(v * 100) / 100,
    },
    dieselLtr: { type: Number },
    dieselPrice: { type: Number },
    adblueLiters: { type: Number },
    adbluePrice: { type: Number },
    paidThrough: { type: String },
    pumpCd: { type: Schema.Types.ObjectId, ref: 'Pump', default: null },
    slipNo: { type: String },
    date: { type: Date, default: Date.now },
    remarks: { type: String },
    status: {
      type: String,
      enum: ['Pending', 'Recovered'],
      default: 'Pending',
    },
    tenant: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: { getters: true },
    toObject: { getters: true },
    runSettersOnQuery: true,
  }
);

// Pre-validate: clear irrelevant fields based on advance type
transporterAdvanceSchema.pre('validate', function (next) {
  if (this.advanceType === 'Diesel') {
    this.dieselLtr = this.dieselLtr || undefined;
    this.dieselPrice = this.dieselPrice || undefined;
    this.pumpCd = this.pumpCd || undefined;
  } else {
    this.dieselLtr = undefined;
    this.dieselPrice = undefined;
    if (this.advanceType === 'Trip Advance') {
      this.pumpCd = this.pumpCd || undefined;
    } else {
      this.pumpCd = undefined;
    }
  }

  if (this.advanceType === 'Adblue') {
    this.adblueLiters = this.adblueLiters || undefined;
    this.adbluePrice = this.adbluePrice || undefined;
  } else {
    this.adblueLiters = undefined;
    this.adbluePrice = undefined;
  }

  next();
});

export default model('TransporterAdvance', transporterAdvanceSchema);
