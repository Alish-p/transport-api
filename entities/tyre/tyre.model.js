import mongoose from 'mongoose';
import { TYRE_STATUS, TYRE_TYPE } from './tyre.constants.js';


const tyreSchema = new mongoose.Schema(
    {
        tenant: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Tenant',
            required: true,
            index: true,
        },
        serialNumber: {
            type: String,
            required: true,
            trim: true,
        },
        brand: {
            type: String,
            required: true,
            trim: true,
        },
        model: {
            type: String,
            required: true,
            trim: true,
        },
        size: {
            type: String,
            required: true,
            trim: true,
        },
        type: {
            type: String,
            enum: Object.values(TYRE_TYPE),
            required: true,
        },

        status: {
            type: String,
            enum: Object.values(TYRE_STATUS),
            default: TYRE_STATUS.IN_STOCK,
            index: true,
        },

        currentKm: {
            type: Number,
            default: 0,
        },
        purchaseDate: {
            type: Date,
            default: Date.now,
        },
        cost: {
            type: Number,
            default: 0,
        },
        purchaseOrderNumber: {
            type: String,
            trim: true,
        },
        currentVehicleId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Vehicle',
            default: null,
        },
        currentPosition: {
            type: String,
            // e.g., 'Front_Left', can be enum if positions are fixed, 
            // but keeping it string for flexibility as per prompt "Front_Left"
            default: null,
        },
        mountOdometer: {
            type: Number,
            default: null,
        },
        threadDepth: {
            original: { type: Number, default: 0 },
            current: { type: Number, default: 0 },
            lastMeasuredDate: { type: Date },
        },
        metadata: {
            isRemoldable: { type: Boolean, default: true },
            remoldCount: { type: Number, default: 0 },
        },
        isActive: {
            type: Boolean,
            default: true,
        },
    },
    {
        timestamps: true,
    }
);

tyreSchema.index({ serialNumber: 1, tenant: 1 }, { unique: true, partialFilterExpression: { isActive: true } });

const Tyre = mongoose.model('Tyre', tyreSchema);

export default Tyre;
