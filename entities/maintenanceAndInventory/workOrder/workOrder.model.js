import { Schema, model } from 'mongoose';
import { WORK_ORDER_STATUS, WORK_ORDER_PRIORITY } from './workOrder.constants.js';

const workOrderPartSchema = new Schema(
  {
    part: {
      type: Schema.Types.ObjectId,
      ref: 'Part',
    },
    partLocation: {
      type: Schema.Types.ObjectId,
      ref: 'PartLocation',
    },
    quantity: { type: Number, required: true, min: 0 },
    price: { type: Number, required: true, min: 0 },
    amount: { type: Number, required: true, min: 0 },
  },
  { _id: true },
);

const workOrderSchema = new Schema(
  {
    vehicle: {
      type: Schema.Types.ObjectId,
      ref: 'Vehicle',
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(WORK_ORDER_STATUS),
      default: WORK_ORDER_STATUS.OPEN,
      index: true,
    },
    priority: {
      type: String,
      enum: Object.values(WORK_ORDER_PRIORITY),
      default: WORK_ORDER_PRIORITY.NON_SCHEDULED,
    },
    scheduledStartDate: { type: Date },
    actualStartDate: { type: Date },
    completedDate: { type: Date },



    odometerReading: { type: Number },

    issues: [
      {
        issue: { type: String },
        assignedTo: {
          type: Schema.Types.ObjectId,
          ref: 'User',
        },
      },
    ],

    labourCharge: { type: Number, default: 0, min: 0 },

    parts: [workOrderPartSchema],

    partsCost: { type: Number, default: 0, min: 0 },
    totalCost: { type: Number, default: 0, min: 0 },

    description: { type: String },

    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    closedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },

    tenant: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true,
    },
  },
  { timestamps: true },
);

workOrderSchema.index({ tenant: 1, vehicle: 1, createdAt: -1 });

export default model('WorkOrder', workOrderSchema);

