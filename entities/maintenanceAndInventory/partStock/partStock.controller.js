import asyncHandler from 'express-async-handler';
import mongoose from 'mongoose';
import PartStock from './partStock.model.js';
import PartTransaction from '../partTransaction/partTransaction.model.js';
import {
    INVENTORY_ACTIVITY_TYPES,
    SOURCE_DOCUMENT_TYPES,
} from '../partTransaction/partTransaction.constants.js';
import Part from '../part/part.model.js';
import PartLocation from '../partLocation/partLocation.model.js';
import { recordInventoryActivity } from '../partTransaction/partTransaction.utils.js';
import { addTenantToQuery } from '../../../utils/tenant-utils.js';

const adjustStock = asyncHandler(async (req, res) => {
    const { partId, inventoryLocation, quantityChange, reason } = req.body;

    if (!partId || !inventoryLocation || quantityChange === undefined) {
        return res.status(400).json({ message: 'partId, inventoryLocation and quantityChange are required' });
    }

    const part = await Part.findOne({ _id: partId, tenant: req.tenant });
    if (!part) {
        return res.status(404).json({ message: 'Part not found' });
    }

    const location = await PartLocation.findOne({ _id: inventoryLocation, tenant: req.tenant });
    if (!location) {
        return res.status(404).json({ message: 'Location not found' });
    }

    const change = Number(quantityChange);
    if (isNaN(change)) {
        return res.status(400).json({ message: 'Invalid quantityChange' });
    }

    const activityType = INVENTORY_ACTIVITY_TYPES.MANUAL_ADJUSTMENT;
    const direction = change >= 0 ? 'IN' : 'OUT';

    try {
        const { partStock } = await recordInventoryActivity({
            tenant: req.tenant,
            partId: partId,
            locationId: inventoryLocation,
            type: activityType,
            direction,
            quantityChange: change,
            performedBy: req.user._id,
            sourceDocumentType: SOURCE_DOCUMENT_TYPES.MANUAL,
            reason: reason || 'Manual Adjustment',
        });

        res.status(200).json(partStock);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

const transferStock = asyncHandler(async (req, res) => {
    const { partId, fromLocationId, toLocationId, quantity, reason } = req.body;

    if (!partId || !fromLocationId || !toLocationId || quantity === undefined) {
        return res.status(400).json({ message: 'partId, fromLocationId, toLocationId, and quantity are required' });
    }

    if (fromLocationId === toLocationId) {
        return res.status(400).json({ message: 'Source and destination locations must be different' });
    }

    const qty = Number(quantity);
    if (isNaN(qty) || qty <= 0) {
        return res.status(400).json({ message: 'Quantity must be a positive number' });
    }

    const part = await Part.findOne({ _id: partId, tenant: req.tenant });
    if (!part) {
        return res.status(404).json({ message: 'Part not found' });
    }

    // Verify locations
    const [sourceLoc, destLoc] = await Promise.all([
        PartLocation.findOne({ _id: fromLocationId, tenant: req.tenant }),
        PartLocation.findOne({ _id: toLocationId, tenant: req.tenant }),
    ]);

    if (!sourceLoc) return res.status(404).json({ message: 'Source location not found' });
    if (!destLoc) return res.status(404).json({ message: 'Destination location not found' });

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        // 1. Deduct from source
        await recordInventoryActivity(
            {
                tenant: req.tenant,
                partId: partId,
                locationId: fromLocationId,
                type: INVENTORY_ACTIVITY_TYPES.TRANSFER_OUT,
                direction: 'OUT',
                quantityChange: -qty,
                performedBy: req.user._id,
                sourceDocumentType: SOURCE_DOCUMENT_TYPES.TRANSFER,
                reason: reason || 'Stock Transfer',
                meta: { toLocationId, toLocationName: destLoc.name },
            },
            session
        );

        // 2. Add to destination
        await recordInventoryActivity(
            {
                tenant: req.tenant,
                partId: partId,
                locationId: toLocationId,
                type: INVENTORY_ACTIVITY_TYPES.TRANSFER_IN,
                direction: 'IN',
                quantityChange: qty,
                performedBy: req.user._id,
                sourceDocumentType: SOURCE_DOCUMENT_TYPES.TRANSFER,
                reason: reason || 'Stock Transfer',
                meta: { fromLocationId, fromLocationName: sourceLoc.name },
            },
            session
        );

        await session.commitTransaction();
        res.status(200).json({ message: 'Stock transferred successfully' });
    } catch (error) {
        await session.abortTransaction();
        res.status(400).json({ message: error.message });
    } finally {
        session.endSession();
    }
});

const fetchInventoryActivities = asyncHandler(async (req, res) => {
    try {
        const {
            fromDate,
            toDate,
            part,
            inventoryLocation,
            type,
            performedBy,
        } = req.query;
        const { limit, skip } = req.pagination;

        const query = addTenantToQuery(req);

        if (fromDate || toDate) {
            query.createdAt = {};
            if (fromDate) query.createdAt.$gte = new Date(fromDate);
            if (toDate) query.createdAt.$lte = new Date(toDate);
        }

        if (part) {
            query.part = part;
        }

        if (inventoryLocation) {
            query.inventoryLocation = inventoryLocation;
        }

        if (type) {
            query.type = type;
        }

        if (performedBy) {
            query.performedBy = performedBy;
        }

        const [activities, total] = await Promise.all([
            PartTransaction.find(query)
                .populate('part', 'partNumber name')
                .populate('inventoryLocation', 'name')
                .populate('performedBy', 'name email')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            PartTransaction.countDocuments(query),
        ]);

        res.status(200).json({
            activities,
            total,
            startRange: skip + 1,
            endRange: skip + activities.length,
        });
    } catch (error) {
        res.status(500).json({
            message: 'An error occurred while fetching inventory activities',
            error: error.message,
        });
    }
});

const checkPartPrice = asyncHandler(async (req, res) => {
    const { partId, locationId } = req.query;

    if (!partId) {
        return res.status(400).json({ message: 'partId is required' });
    }

    const part = await Part.findOne({
        _id: new mongoose.Types.ObjectId(partId),
        tenant: req.tenant
    });

    if (!part) {
        return res.status(404).json({ message: 'Part not found' });
    }

    // Default to global average or unit cost
    let price = part.averageUnitCost || part.unitCost || 0;

    res.status(200).json({ unitCost: price });
});

export {
    adjustStock,
    transferStock,
    fetchInventoryActivities,
    checkPartPrice,
};
