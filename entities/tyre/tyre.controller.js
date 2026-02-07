import asyncHandler from 'express-async-handler';
import Tyre from './tyre.model.js';
import TyreHistory from './tyre-history.model.js';
import { addTenantToQuery } from '../../utils/tenant-utils.js';
import { TYRE_STATUS, TYRE_TYPE, TYRE_HISTORY_ACTION } from './tyre.constants.js';



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
        // openingkm (totalMileage) is 0 if type is New
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
    let totalMileage = req.body.totalMileage;
    if (type === TYRE_TYPE.NEW) {
        totalMileage = 0;
    }


    const tyre = await Tyre.create({
        tenant: req.tenant,
        serialNumber,
        brand,
        model,
        size,
        type,
        status,
        totalMileage: totalMileage || 0,
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

// @desc    Get all tyres (paginated)
// @route   GET /api/tyre
// @access  Private
const getTyres = asyncHandler(async (req, res) => {
    const { search, type, status, brand, vehicleId, position } = req.query;
    const { limit, skip } = req.pagination;

    const query = addTenantToQuery(req);
    query.isActive = { $ne: false };

    if (search) {
        query.$or = [
            { serialNumber: { $regex: search, $options: 'i' } },
            { brand: { $regex: search, $options: 'i' } },
            { model: { $regex: search, $options: 'i' } },
            { size: { $regex: search, $options: 'i' } },
        ];
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

    // Analytics Aggregation
    const analyticsQuery = { ...query };
    delete analyticsQuery.status;
    delete analyticsQuery.skip;
    delete analyticsQuery.limit;

    const [tyres, total, analyticsData] = await Promise.all([
        Tyre.find(query)
            .populate('currentVehicleId', 'vehicleNo')
            .sort({ createdAt: -1 })
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
    if (odometer && tyre.mountOdometer) {
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
    tyre.totalMileage = (tyre.totalMileage || 0) + distanceCovered;

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

export { createTyre, getTyres, getTyreById, updateTyre, updateThreadDepth, mountTyre, unmountTyre, getTyreHistory };
