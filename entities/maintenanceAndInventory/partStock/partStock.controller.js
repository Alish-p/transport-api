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
                .populate('part', 'partNumber name averageUnitCost unitCost')
                .populate('inventoryLocation', 'name')
                .populate('performedBy', 'name email')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            PartTransaction.countDocuments(query),
        ]);

        const enrichedActivities = activities.map((activity) => {
            const avgUnitCost = activity.averageUnitCost || activity.meta?.unitCost || activity.part?.averageUnitCost || activity.part?.unitCost || 0;
            const totalCost = activity.totalCost || Math.abs(activity.quantityChange) * avgUnitCost;

            return {
                ...activity,
                averageUnitCost: avgUnitCost,
                totalCost,
                sourceDocumentNumber: activity.meta?.sourceDocumentNumber || null,
            };
        });

        res.status(200).json({
            activities: enrichedActivities,
            total,
            startRange: skip + 1,
            endRange: skip + enrichedActivities.length,
        });
    } catch (error) {
        res.status(500).json({
            message: 'An error occurred while fetching inventory activities',
            error: error.message,
        });
    }
});

const exportInventoryActivities = asyncHandler(async (req, res) => {
    const {
        fromDate,
        toDate,
        part,
        inventoryLocation,
        type,
        performedBy,
        columns, // Comma separated column IDs
    } = req.query;

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

    // Column Mapping
    const COLUMN_MAPPING = {
        activityDate: { header: 'Date', key: 'activityDate', width: 20 },
        part: { header: 'Part', key: 'part', width: 25 },
        type: { header: 'Adjustment Type', key: 'type', width: 25 },
        reason: { header: 'Adjustment Reason', key: 'reason', width: 30 },
        qtyChange: { header: 'Qty', key: 'qtyChange', width: 15 },
        averageUnitCost: { header: 'Avg Unit Cost', key: 'averageUnitCost', width: 20 },
        totalCost: { header: 'Amount', key: 'totalCost', width: 20 },
        performedBy: { header: 'Performed By', key: 'performedBy', width: 25 },
    };

    let exportColumns = [];
    if (columns) {
        const columnIds = columns.split(',');
        exportColumns = columnIds
            .map((id) => COLUMN_MAPPING[id])
            .filter((col) => col);
    }

    if (exportColumns.length === 0) {
        exportColumns = [
            COLUMN_MAPPING.activityDate,
            COLUMN_MAPPING.part,
            COLUMN_MAPPING.type,
            COLUMN_MAPPING.qtyChange,
            COLUMN_MAPPING.totalCost,
        ];
    }

    res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
        "Content-Disposition",
        "attachment; filename=InventoryActivities.xlsx"
    );

    const ExcelJS = await import('exceljs');
    const workbook = new ExcelJS.default.stream.xlsx.WorkbookWriter({
        stream: res,
        useStyles: true,
    });

    const worksheet = workbook.addWorksheet('Inventory Activities');
    worksheet.columns = exportColumns;

    const cursor = PartTransaction.find(query)
        .populate('part', 'partNumber name averageUnitCost unitCost')
        .populate('inventoryLocation', 'name')
        .populate('performedBy', 'name email')
        .sort({ createdAt: -1 })
        .cursor();

    for (let doc = await cursor.next(); doc != null; doc = await cursor.next()) {
        const row = {};

        const avgUnitCost = doc.averageUnitCost || doc.meta?.unitCost || doc.part?.averageUnitCost || doc.part?.unitCost || 0;
        const totalCost = doc.totalCost || Math.abs(doc.quantityChange) * avgUnitCost;

        exportColumns.forEach((col) => {
            const key = col.key;
            if (key === 'activityDate') {
                row[key] = doc.createdAt ? new Date(doc.createdAt).toLocaleDateString() : '-';
            } else if (key === 'part') {
                row[key] = doc.part ? `${doc.part.name} (${doc.part.partNumber || ''})` : '-';
            } else if (key === 'type') {
                row[key] = doc.type || '-';
            } else if (key === 'reason') {
                row[key] = doc.reason || '-';
            } else if (key === 'qtyChange') {
                row[key] = doc.quantityChange || 0;
            } else if (key === 'averageUnitCost') {
                row[key] = avgUnitCost;
            } else if (key === 'totalCost') {
                row[key] = totalCost;
            } else if (key === 'performedBy') {
                row[key] = doc.performedBy ? doc.performedBy.name : '-';
            }
        });

        worksheet.addRow(row).commit();
    }

    worksheet.commit();
    await workbook.commit();
});

export {
    adjustStock,
    transferStock,
    fetchInventoryActivities,
    exportInventoryActivities,
};
