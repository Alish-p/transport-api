import mongoose from 'mongoose';
import asyncHandler from 'express-async-handler';
import Tyre from './tyre.model.js';
import TyreHistory from './tyre-history.model.js';
import { addTenantToQuery } from '../../utils/tenant-utils.js';
import { TYRE_STATUS, TYRE_TYPE, TYRE_HISTORY_ACTION } from './tyre.constants.js';
import { TYRE_POSITIONS } from '../../constants/tyreLayouts.js';



// @desc    Create a new tyre
// @route   POST /api/tyre
// @access  Private
const createTyre = asyncHandler(async (req, res) => {
    const {
        serialNumber,
        brand,
        model,
        size,
        type,
        // status is forced to In_Stock by business logic if not provided or overridden
        // openingkm (currentKm) is 0 if type is New
        purchaseDate,
        cost,
        purchaseOrderNumber,
        threadDepth,
        metadata,
    } = req.body;

    // Business logic overrides
    // "on creation dont ask status: In_Stock... it will be in_stock only"
    const status = TYRE_STATUS.IN_STOCK;
    const currentVehicleId = null;
    const currentPosition = null;

    // "if type new = openingkm will be 0 disabled"
    let currentKm = req.body.currentKm;
    if (type === TYRE_TYPE.NEW) {
        currentKm = 0;
    }


    const tyre = await Tyre.create({
        tenant: req.tenant,
        serialNumber,
        brand,
        model,
        size,
        type,
        status,
        currentKm: currentKm || 0,
        purchaseDate: purchaseDate || new Date(),
        cost: cost || 0,
        purchaseOrderNumber,
        currentVehicleId,
        currentPosition,
        threadDepth: {
            original: threadDepth?.original || 0,
            current: threadDepth?.current || (threadDepth?.original || 0), // Default current to original if not set
            lastMeasuredDate: threadDepth?.lastMeasuredDate || new Date(),
        },
        metadata: {
            isRemoldable: metadata?.isRemoldable ?? true,
            remoldCount: metadata?.remoldCount || 0,
        },
    });

    res.status(201).json(tyre);
});

// @desc    Create bulk tyres
// @route   POST /api/tyre/bulk
// @access  Private
const createBulkTyres = asyncHandler(async (req, res) => {
    const { tyres } = req.body;

    if (!Array.isArray(tyres) || tyres.length === 0) {
        res.status(400);
        throw new Error('No tyres data provided');
    }

    const tyresToCreate = tyres.map(tyreData => {
        const {
            serialNumber,
            brand,
            model,
            size,
            type,
            purchaseDate,
            cost,
            purchaseOrderNumber,
            threadDepth,
            metadata,
        } = tyreData;

        // "on creation dont ask status: In_Stock... it will be in_stock only"
        const status = TYRE_STATUS.IN_STOCK;

        // "if type new = openingkm will be 0 disabled"
        let currentKm = tyreData.currentKm;
        if (type === TYRE_TYPE.NEW) {
            currentKm = 0;
        }

        return {
            tenant: req.tenant,
            serialNumber,
            brand,
            model,
            size,
            type,
            status,
            currentKm: currentKm || 0,
            purchaseDate: purchaseDate || new Date(),
            cost: cost || 0,
            purchaseOrderNumber,
            currentVehicleId: null,
            currentPosition: null,
            threadDepth: {
                original: threadDepth?.original || 0,
                current: threadDepth?.current || (threadDepth?.original || 0),
                lastMeasuredDate: threadDepth?.lastMeasuredDate || new Date(),
            },
            metadata: {
                isRemoldable: metadata?.isRemoldable ?? true,
                remoldCount: metadata?.remoldCount || 0,
            },
        };
    });

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const createdTyres = await Tyre.insertMany(tyresToCreate, { session, ordered: true });
        await session.commitTransaction();
        res.status(201).json(createdTyres);
    } catch (error) {
        await session.abortTransaction();
        res.status(400); // Bad Request commonly used for validation/duplicate key errors
        throw error;
    } finally {
        session.endSession();
    }
});

// @desc    Get all tyres (paginated)
// @route   GET /api/tyre
// @access  Private
const getTyres = asyncHandler(async (req, res) => {
    const { type, status, brand, vehicleId, position, minKm, maxKm, serialNumber, model, size, minThread, maxThread } = req.query;
    const { limit, skip } = req.pagination;

    const query = addTenantToQuery(req);
    query.isActive = { $ne: false };



    if (serialNumber) {
        query.serialNumber = { $regex: serialNumber, $options: 'i' };
    }

    if (type) {
        query.type = type;
    }

    if (status) {
        query.status = status;
    }

    if (brand) {
        query.brand = { $regex: brand, $options: 'i' };
    }

    if (vehicleId) {
        query.currentVehicleId = vehicleId;
    }

    if (position) {
        query.currentPosition = position;
    }

    if (minKm || maxKm) {
        query.currentKm = {};
        if (minKm) query.currentKm.$gte = Number(minKm);
        if (maxKm) query.currentKm.$lte = Number(maxKm);
    }

    if (minThread || maxThread) {
        query['threadDepth.current'] = {};
        if (minThread) query['threadDepth.current'].$gte = Number(minThread);
        if (maxThread) query['threadDepth.current'].$lte = Number(maxThread);
    }

    if (model) {
        query.model = { $regex: model, $options: 'i' };
    }

    if (size) {
        query.size = { $regex: size, $options: 'i' };
    }

    // Analytics Aggregation
    const analyticsQuery = { ...query };
    delete analyticsQuery.status;
    delete analyticsQuery.skip;
    delete analyticsQuery.limit;

    // Sorting
    let sort = {};
    const { orderBy, order } = req.query;

    if (orderBy && order) {
        let sortField = orderBy;

        // Map frontend fields to backend fields
        if (orderBy === 'threadDepth') {
            sortField = 'threadDepth.current';
        }

        sort[sortField] = order === 'desc' ? -1 : 1;
    } else {
        sort = { createdAt: -1 };
    }

    const [tyres, total, analyticsData] = await Promise.all([
        Tyre.find(query)
            .populate('currentVehicleId', 'vehicleNo')
            .sort(sort)
            .skip(skip)
            .limit(limit)
            .lean(),
        Tyre.countDocuments(query),
        Tyre.aggregate([
            { $match: analyticsQuery },
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 },
                    value: { $sum: { $ifNull: ['$cost', 0] } },
                },
            },
        ]),
    ]);

    const totals = {
        all: { count: 0, value: 0 },
        [TYRE_STATUS.IN_STOCK]: { count: 0, value: 0 },
        [TYRE_STATUS.SCRAPPED]: { count: 0, value: 0 },
        [TYRE_STATUS.MOUNTED]: { count: 0, value: 0 }, // keeping it for completeness or if needed later
    };

    // Calculate 'All' from the analyticsData
    analyticsData.forEach((group) => {
        totals.all.count += group.count;
        totals.all.value += group.value;
        if (totals[group._id]) {
            totals[group._id] = { count: group.count, value: group.value };
        }
    });

    res.status(200).json({
        tyres,
        total,
        totals, // Send back the analytics
        startRange: skip + 1,
        endRange: skip + tyres.length,
    });
});


// @desc    Get single tyre by ID
// @route   GET /api/tyre/:id
// @access  Private
const getTyreById = asyncHandler(async (req, res) => {
    const tyre = await Tyre.findOne({ _id: req.params.id, tenant: req.tenant }).lean();
    if (tyre) {
        res.json(tyre);
    } else {
        res.status(404);
        throw new Error('Tyre not found');
    }
});

// @desc    Update tyre
// @route   PUT /api/tyre/:id
// @access  Private
const updateTyre = asyncHandler(async (req, res) => {
    const tyre = await Tyre.findOne({ _id: req.params.id, tenant: req.tenant });

    if (tyre) {
        tyre.brand = req.body.brand || tyre.brand;
        tyre.model = req.body.model || tyre.model;
        tyre.size = req.body.size || tyre.size;
        tyre.serialNumber = req.body.serialNumber || tyre.serialNumber;
        tyre.purchaseDate = req.body.purchaseDate || tyre.purchaseDate;
        tyre.cost = req.body.cost || tyre.cost;
        tyre.purchaseOrderNumber = req.body.purchaseOrderNumber || tyre.purchaseOrderNumber;

        // Handle metadata updates if needed
        if (req.body.metadata) {
            tyre.metadata = { ...tyre.metadata, ...req.body.metadata };
        }

        // Handle threadDepth updates (specifically original)
        if (req.body.threadDepth && req.body.threadDepth.original) {
            // Ensure threadDepth object exists
            if (!tyre.threadDepth) {
                tyre.threadDepth = {};
            }
            tyre.threadDepth.original = req.body.threadDepth.original;
        }

        const updatedTyre = await tyre.save();
        res.json(updatedTyre);
    } else {
        res.status(404);
        throw new Error('Tyre not found');
    }
});

// @desc    Update tyre thread depth
// @route   POST /api/tyre/:id/thread
// @access  Private
const updateThreadDepth = asyncHandler(async (req, res) => {
    const { current, measuringDate } = req.body;

    const tyre = await Tyre.findOne({ _id: req.params.id, tenant: req.tenant });

    if (!tyre) {
        res.status(404);
        throw new Error('Tyre not found');
    }

    const previousThreadDepth = tyre.threadDepth?.current || 0;

    // Update tyre current thread depth
    tyre.threadDepth.current = current;
    tyre.threadDepth.lastMeasuredDate = measuringDate || new Date();

    await tyre.save();

    // Create history record
    await TyreHistory.create({
        tenant: req.tenant,
        tyre: tyre._id,
        action: TYRE_HISTORY_ACTION.THREAD_UPDATE,
        previousThreadDepth,
        newThreadDepth: current,
        measuringDate: measuringDate || new Date(),
    });


    res.json(tyre);
});

// @desc    Mount tyre to vehicle
// @route   POST /api/tyre/:id/mount
// @access  Private
const mountTyre = asyncHandler(async (req, res) => {
    const { vehicleId, position, mountDate } = req.body;
    const tyreId = req.params.id;

    // 1. Get Tyre
    const tyre = await Tyre.findOne({ _id: tyreId, tenant: req.tenant });
    if (!tyre) {
        res.status(404);
        throw new Error('Tyre not found');
    }

    if (tyre.status === TYRE_STATUS.MOUNTED) {
        res.status(400);
        throw new Error(`Tyre is already mounted on a vehicle`);
    }

    // 2. Check if position is occupied
    const occupiedTyre = await Tyre.findOne({
        tenant: req.tenant,
        currentVehicleId: vehicleId,
        currentPosition: position,
        status: TYRE_STATUS.MOUNTED
    });


    if (occupiedTyre) {
        res.status(400);
        throw new Error(`Position ${position} is already occupied by tyre ${occupiedTyre.serialNumber}`);
    }

    // 3. Update Tyre
    tyre.status = TYRE_STATUS.MOUNTED;
    tyre.currentVehicleId = vehicleId;
    tyre.currentPosition = position;

    tyre.mountOdometer = req.body.odometer;

    await tyre.save();

    // 4. Create History
    await TyreHistory.create({
        tenant: req.tenant,
        tyre: tyre._id,
        action: TYRE_HISTORY_ACTION.MOUNT,
        vehicleId,
        position,
        odometer: req.body.odometer, // fixed missing odometer from body
        date: mountDate || new Date(),
    });


    res.json(tyre);
});

// @desc    Unmount tyre from vehicle
// @route   POST /api/tyre/:id/unmount
// @access  Private
const unmountTyre = asyncHandler(async (req, res) => {
    const { odometer, unmountDate } = req.body;
    const tyreId = req.params.id;

    // 1. Get Tyre
    const tyre = await Tyre.findOne({ _id: tyreId, tenant: req.tenant });
    if (!tyre) {
        res.status(404);
        throw new Error('Tyre not found');
    }

    if (tyre.status !== TYRE_STATUS.MOUNTED) {
        res.status(400);
        throw new Error(`Tyre is not currently mounted`);
    }


    // 2. Calculate Distance
    let distanceCovered = 0;

    // Valid Stapney positions check
    const isStepney = [TYRE_POSITIONS.STEPNEY_1, TYRE_POSITIONS.STEPNEY_2].includes(tyre.currentPosition);

    if (isStepney) {
        distanceCovered = 0;
    } else if (odometer && tyre.mountOdometer) {
        distanceCovered = odometer - tyre.mountOdometer;
        if (distanceCovered < 0) {
            //give error
            res.status(400);
            throw new Error('Odometer reading is less than mount odometer reading');
        }
    }

    // 3. Update Tyre
    // Keep track of where it was for history before clearing
    const vehicleId = tyre.currentVehicleId;
    const position = tyre.currentPosition;
    const mountOdometer = tyre.mountOdometer;

    tyre.status = TYRE_STATUS.IN_STOCK;

    tyre.currentVehicleId = null;
    tyre.currentPosition = null;
    tyre.mountOdometer = null;
    tyre.currentKm = (tyre.currentKm || 0) + distanceCovered;

    // improved logic: if tyre was NEW and has covered distance, mark it as USED
    if (tyre.type === TYRE_TYPE.NEW && distanceCovered > 0) {
        tyre.type = TYRE_TYPE.USED;
    }

    await tyre.save();

    // 4. Create History
    await TyreHistory.create({
        tenant: req.tenant,
        tyre: tyre._id,
        action: TYRE_HISTORY_ACTION.UNMOUNT,
        vehicleId,
        position,

        odometer: odometer,
        distanceCovered,
        measuringDate: unmountDate || new Date(),
        metadata: {
            mountOdometer: mountOdometer
        }
    });

    res.json(tyre);
});

// @desc    Get tyre history
// @route   GET /api/tyre/:id/history
// @access  Private
const getTyreHistory = asyncHandler(async (req, res) => {
    const history = await TyreHistory.find({ tyre: req.params.id, tenant: req.tenant })
        .populate('vehicleId', 'vehicleNo')
        .sort({ createdAt: -1 });

    res.json(history);
});

// @desc    Scrap tyre
// @route   POST /api/tyre/:id/scrap
// @access  Private
const scrapTyre = asyncHandler(async (req, res) => {
    const { odometer, scrapDate } = req.body;
    const tyreId = req.params.id;

    // 1. Get Tyre
    const tyre = await Tyre.findOne({ _id: tyreId, tenant: req.tenant });
    if (!tyre) {
        res.status(404);
        throw new Error('Tyre not found');
    }

    if (tyre.status === TYRE_STATUS.SCRAPPED) {
        res.status(400);
        throw new Error('Tyre is already scrapped');
    }

    // 2. Handle if Mounted (Implicit Unmount Logic)
    let distanceCovered = 0;

    // Store current state for history before clearing
    const vehicleId = tyre.currentVehicleId;
    const position = tyre.currentPosition;
    const mountOdometer = tyre.mountOdometer;

    if (tyre.status === TYRE_STATUS.MOUNTED) {
        if (!odometer) {
            res.status(400);
            throw new Error('Odometer reading is required when scrapping a mounted tyre');
        }

        if (odometer && tyre.mountOdometer) {
            // Valid Stapney positions check
            const isStepney = [TYRE_POSITIONS.STEPNEY_1, TYRE_POSITIONS.STEPNEY_2].includes(tyre.currentPosition);

            if (isStepney) {
                distanceCovered = 0;
            } else {
                distanceCovered = odometer - tyre.mountOdometer;
                if (distanceCovered < 0) {
                    res.status(400);
                    throw new Error('Odometer reading cannot be less than mount odometer reading');
                }
            }
        }

        // Update total mileage from this final run
        tyre.currentKm = (tyre.currentKm || 0) + distanceCovered;
    }

    // 3. Update Tyre Status and Clear Mounting Info
    tyre.status = TYRE_STATUS.SCRAPPED;
    tyre.currentVehicleId = null;
    tyre.currentPosition = null;
    tyre.mountOdometer = null;

    await tyre.save();

    // 4. Create History
    const historyData = {
        tenant: req.tenant,
        tyre: tyre._id,
        action: TYRE_HISTORY_ACTION.SCRAP,
        measuringDate: scrapDate || new Date(),
    };

    // Only add vehicle info if it was mounted
    if (vehicleId) {
        historyData.vehicleId = vehicleId;
        historyData.position = position;
        historyData.odometer = odometer;
        historyData.distanceCovered = distanceCovered;
        historyData.metadata = {
            mountOdometer: mountOdometer
        };
    }

    await TyreHistory.create(historyData);

    res.json(tyre);
});


// @desc    Update tyre history (odometer correction)
// @route   PUT /api/tyre/:id/history/:historyId
// @access  Private
const updateTyreHistory = asyncHandler(async (req, res) => {
    const { odometer } = req.body;
    const { id: tyreId, historyId } = req.params;

    const history = await TyreHistory.findOne({ _id: historyId, tyre: tyreId, tenant: req.tenant });
    if (!history) {
        res.status(404);
        throw new Error('History record not found');
    }

    const tyre = await Tyre.findOne({ _id: tyreId, tenant: req.tenant });
    if (!tyre) {
        res.status(404);
        throw new Error('Tyre not found');
    }

    if (!odometer) {
        res.status(400);
        throw new Error('Odometer reading is required');
    }

    // Handle Unmount/Scrap Update
    if (history.action === TYRE_HISTORY_ACTION.UNMOUNT || history.action === TYRE_HISTORY_ACTION.SCRAP) {
        // Recalculate distance covered
        // history.metadata.mountOdometer should exist for unmount/scrap
        let mountOdometer = history.metadata?.mountOdometer;

        // Fallback: Infer from existing record if metadata is missing (for legacy data)
        // If we have current odometer and distance covered, we can calculate what the mount odometer was.
        if ((mountOdometer === undefined || mountOdometer === null) && history.odometer && history.distanceCovered !== undefined) {
            mountOdometer = history.odometer - history.distanceCovered;
        }

        if (mountOdometer !== undefined && mountOdometer !== null) {
            let newDistanceCovered = 0;

            // Valid Stapney positions check
            const isStepney = [TYRE_POSITIONS.STEPNEY_1, TYRE_POSITIONS.STEPNEY_2].includes(history.position);

            if (isStepney) {
                newDistanceCovered = 0;
            } else {
                newDistanceCovered = odometer - mountOdometer;
                if (newDistanceCovered < 0) {
                    res.status(400);
                    throw new Error('Odometer reading cannot be less than mount odometer reading');
                }
            }

            const oldDistanceCovered = history.distanceCovered || 0;

            // Update History
            history.odometer = odometer;
            history.distanceCovered = newDistanceCovered;

            // Ensure we save the inferred/existing mountOdometer to metadata for future updates
            if (!history.metadata) history.metadata = {};
            history.metadata.mountOdometer = mountOdometer;

            await history.save();

            // Update Tyre Total Mileage
            // tyre.currentKm = tyre.currentKm - oldDistance + newDistance
            tyre.currentKm = (tyre.currentKm || 0) - oldDistanceCovered + newDistanceCovered;
            // Ensure currentKm doesn't go below 0 (though theoretically shouldn't)
            if (tyre.currentKm < 0) tyre.currentKm = 0;

            await tyre.save();

            return res.json(history);
        } else {
            // Fallback if metadata is missing and CANNOT be inferred
            res.status(400);
            throw new Error('Cannot update history: Missing mount odometer reference and cannot infer from existing data');
        }
    }

    // Handle Mount Update
    if (history.action === TYRE_HISTORY_ACTION.MOUNT) {
        // If we update mount odometer, we need to check if the tyre is still mounted 
        // AND if this history item corresponds to the current mounting.

        // Simple check: Is the tyre currently mounted on the same vehicle/position?
        const isCurrentMount =
            tyre.status === TYRE_STATUS.MOUNTED &&
            tyre.currentVehicleId?.toString() === history.vehicleId?.toString() &&
            tyre.currentPosition === history.position;

        // Also check timestamps to be sure? 
        // Or if tyre.mountOdometer roughly equals history.odometer (before update)

        if (isCurrentMount) {
            tyre.mountOdometer = odometer;
            await tyre.save();
        } else {
            // Tyre is no longer mounted (or different mount).
            // This means there is likely a subsequent UNMOUNT history item that used the OLD mount odometer.
            // We should ideally find it and update it.
            // This is complex because we need to find the specific unmount paired with this mount.
            // Strategy: Find the first UNMOUNT/SCRAP *after* this MOUNT history date.

            const nextHistory = await TyreHistory.findOne({
                tyre: tyreId,
                tenant: req.tenant,
                action: { $in: [TYRE_HISTORY_ACTION.UNMOUNT, TYRE_HISTORY_ACTION.SCRAP] },
                createdAt: { $gt: history.createdAt }
            }).sort({ createdAt: 1 });

            if (nextHistory) {
                // Recalculate that unmount's distance
                const unmountOdometer = nextHistory.odometer;
                const oldMountOdometer = history.odometer; // Current value in DB before update
                const oldDistance = nextHistory.distanceCovered;

                // Update the metadata of the unmount event so it knows the new start point
                if (!nextHistory.metadata) nextHistory.metadata = {};
                nextHistory.metadata.mountOdometer = odometer; // New mount odometer

                const newDistance = unmountOdometer - odometer;

                // Check validity
                if (newDistance < 0) {
                    res.status(400);
                    throw new Error(`New mount odometer (${odometer}) is greater than unmount odometer (${unmountOdometer})`);
                }

                nextHistory.distanceCovered = newDistance;
                await nextHistory.save();

                // Update total mileage (remove old distance, add new)
                tyre.currentKm = (tyre.currentKm || 0) - oldDistance + newDistance;
                if (tyre.currentKm < 0) tyre.currentKm = 0;
                await tyre.save();
            }
            // If no next history found, maybe it was just unmounted without a history record (legacy/bug)? 
            // Or maybe current status is IN_STOCK but no Unmount record? Unlikely.
        }

        history.odometer = odometer;
        await history.save();
        return res.json(history);
    }

    res.status(400);
    throw new Error('This history action type cannot be updated');
});

// @desc    Remold tyre (In Stock only)
// @route   POST /api/tyre/:id/remold
// @access  Private
const remoldTyre = asyncHandler(async (req, res) => {
    const { newThreadDepth, remoldDate } = req.body;
    const tyreId = req.params.id;

    // 1. Get Tyre
    const tyre = await Tyre.findOne({ _id: tyreId, tenant: req.tenant });
    if (!tyre) {
        res.status(404);
        throw new Error('Tyre not found');
    }

    // 2. Validation
    if (tyre.status !== TYRE_STATUS.IN_STOCK) {
        res.status(400);
        throw new Error('Only In Stock tyres can be remolded');
    }

    if (!newThreadDepth) {
        res.status(400);
        throw new Error('New thread depth is required');
    }

    const currentThreadDepth = tyre.threadDepth?.current || 0;
    if (newThreadDepth <= currentThreadDepth) {
        res.status(400);
        throw new Error(`New thread depth (${newThreadDepth}) must be greater than current thread depth (${currentThreadDepth})`);
    }

    // 3. Update Tyre
    // Snapshot previous state for history
    const previousThreadDepth = currentThreadDepth;

    // Update thread depths (both current and original as it's a new life)
    tyre.threadDepth.current = newThreadDepth;
    // tyre.threadDepth.original = newThreadDepth; // deciding whether to update original or not. Plan said yes. Let's do it.
    // Actually, usually original means "from factory". But for Remold, it's like a new tyre.
    // Let's update original too so "Remaining Thread" calculation works (current/original).
    tyre.threadDepth.original = newThreadDepth;
    tyre.threadDepth.lastMeasuredDate = remoldDate || new Date();

    // Update Type if not already remolded
    if (tyre.type !== TYRE_TYPE.REMOLDED) {
        tyre.type = TYRE_TYPE.REMOLDED;
    }

    // Increment remold count
    if (!tyre.metadata) tyre.metadata = {};
    tyre.metadata.remoldCount = (tyre.metadata.remoldCount || 0) + 1;
    tyre.metadata.totalKmAtLastRemold = tyre.currentKm || 0;

    await tyre.save();

    // 4. Create History
    await TyreHistory.create({
        tenant: req.tenant,
        tyre: tyre._id,
        action: TYRE_HISTORY_ACTION.REMOLD,
        previousThreadDepth,
        newThreadDepth,
        measuringDate: remoldDate || new Date(),
        metadata: {
            remoldCount: tyre.metadata.remoldCount
        }
    });

    res.json(tyre);
});

export { createTyre, createBulkTyres, getTyres, getTyreById, updateTyre, updateThreadDepth, mountTyre, unmountTyre, getTyreHistory, scrapTyre, updateTyreHistory, remoldTyre };


