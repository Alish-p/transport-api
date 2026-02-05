import mongoose from 'mongoose';

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
            enum: ['THREAD_UPDATE', 'MOUNT', 'DISMOUNT', 'UPDATE'],
            default: 'UPDATE',
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
