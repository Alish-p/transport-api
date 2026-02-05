import asyncHandler from 'express-async-handler';
import Tyre from './tyre.model.js';
import TyreHistory from './tyre-history.model.js';
import { addTenantToQuery } from '../../utils/tenant-utils.js';

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
    const status = 'In_Stock';
    const currentVehicleId = null;
    const currentPosition = null;

    // "if type new = openingkm will be 0 disabled"
    let totalMileage = req.body.totalMileage;
    if (type === 'New') {
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
    const { search, type, status, brand } = req.query;
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

    const [tyres, total] = await Promise.all([
        Tyre.find(query)
            .sort({ createdAt: -1 }) // Default sort by newest
            .skip(skip)
            .limit(limit)
            .lean(),
        Tyre.countDocuments(query),
    ]);

    res.status(200).json({
        tyres,
        total,
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
        action: 'THREAD_UPDATE',
        previousThreadDepth,
        newThreadDepth: current,
        measuringDate: measuringDate || new Date(),
    });

    res.json(tyre);
});

export { createTyre, getTyres, getTyreById, updateTyre, updateThreadDepth };
