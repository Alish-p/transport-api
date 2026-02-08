import mongoose from 'mongoose';
import { TYRE_HISTORY_ACTION } from './tyre.constants.js';

const tyreHistorySchema = new mongoose.Schema(
    {
        tenant: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Tenant',
            required: true,
            index: true,
        },
        tyre: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Tyre',
            required: true,
            index: true,
        },
        action: {
            type: String,
            enum: Object.values(TYRE_HISTORY_ACTION),
            default: TYRE_HISTORY_ACTION.UPDATE,
        },
        previousThreadDepth: {
            type: Number,
        },
        newThreadDepth: {
            type: Number,
        },
        measuringDate: {
            type: Date,
            default: Date.now,
        },
        vehicleId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Vehicle',
        },
        position: {
            type: String,
        },
        odometer: {
            type: Number,
        },
        distanceCovered: {
            type: Number,
        },
        metadata: {
            type: Map,
            of: mongoose.Schema.Types.Mixed,
        },
    },
    {
        timestamps: true,
    }
);

const TyreHistory = mongoose.model('TyreHistory', tyreHistorySchema);

export default TyreHistory;
