import { Schema, model } from 'mongoose';

const offenceSchema = new Schema(
  {
    act: { type: String },
    name: { type: String },
  },
  { _id: false }
);

const challanSchema = new Schema(
  {
    tenant: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    vehicle: { type: Schema.Types.ObjectId, ref: 'Vehicle', required: true, index: true },
    vehicleNo: { type: String, required: true, index: true },

    provider: { type: String, default: 'webcorevision', index: true },

    challanNo: { type: String, required: true },
    status: { type: String, enum: ['Pending', 'Disposed'], required: true },

    challanDateTime: { type: Date },
    place: { type: String },
    sentToRegCourt: { type: String }, // 'Yes' | 'No'
    remark: { type: String },
    fineImposed: { type: Number },

    dlNo: { type: String },
    driverName: { type: String },
    ownerName: { type: String },
    violatorName: { type: String },

    receiptNo: { type: String },
    receivedAmount: { type: Number },

    department: { type: String },
    stateCode: { type: String },
    documentImpounded: { type: String },
    offenceDetails: [offenceSchema],

    amountOfFineImposed: { type: Number },
    courtAddress: { type: String },
    courtName: { type: String },
    dateOfProceeding: { type: Date },
    sentToCourtOn: { type: Date },
    sentToVirtualCourt: { type: String }, // 'Yes' | 'No'
    rtoDistrictName: { type: String },
  },
  { timestamps: true }
);

// Prevent duplicates per tenant
challanSchema.index({ tenant: 1, challanNo: 1 }, { unique: true });
challanSchema.index({ tenant: 1, vehicleNo: 1, status: 1 });

export default model('Challan', challanSchema);

