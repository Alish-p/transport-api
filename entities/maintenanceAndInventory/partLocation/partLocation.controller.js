import asyncHandler from 'express-async-handler';
import PartLocation from './partLocation.model.js';
import Part from '../part/part.model.js';
import PartStock from '../partStock/partStock.model.js';
import { PART_LOCATION_SEARCH_FIELDS } from '../part/part.constants.js';
import { addTenantToQuery } from '../../../utils/tenant-utils.js';

// ─── PART LOCATIONS CRUD ──────────────────────────────────────────────────────

const createPartLocation = asyncHandler(async (req, res) => {
    const partLocation = new PartLocation({ ...req.body, tenant: req.tenant });
    const newLocation = await partLocation.save();

    // Proactively create PartStock records for all existing active parts for this new location.
    // This ensures that when viewing any part, this location is already available in the inventory list.
    try {
        const activeParts = await Part.find({
            tenant: req.tenant,
            isActive: { $ne: false }
        }).select('_id unitCost');

        if (activeParts.length > 0) {
            const inventoryRecords = activeParts.map(part => ({
                tenant: req.tenant,
                part: part._id,
                inventoryLocation: newLocation._id,
                quantity: 0,
                threshold: 0,
                averageUnitCost: part.unitCost || 0,
            }));

            // Use insertMany or bulkWrite if needed, but insertMany is fine here for simple creation
            await PartStock.insertMany(inventoryRecords, { ordered: false });
        }
    } catch (error) {
        // We log the error but don't fail the location creation if inventory initialization fails
        console.error('Failed to initialize inventory for new location:', newLocation._id, error);
    }

    res.status(201).json(newLocation);
});

const fetchPartLocations = asyncHandler(async (req, res) => {
    try {
        const { search } = req.query;
        const { limit, skip } = req.pagination;

        const query = addTenantToQuery(req);
        query.isActive = { $ne: false };

        if (search) {
            query.$or = PART_LOCATION_SEARCH_FIELDS.map((field) => ({
                [field]: { $regex: search, $options: 'i' },
            }));
        }

        const [locations, total] = await Promise.all([
            PartLocation.find(query).sort({ name: 1 }).skip(skip).limit(limit),
            PartLocation.countDocuments(query),
        ]);

        res.status(200).json({
            locations,
            total,
            startRange: skip + 1,
            endRange: skip + locations.length,
        });
    } catch (error) {
        res.status(500).json({
            message: 'An error occurred while fetching paginated part locations',
            error: error.message,
        });
    }
});

const fetchPartLocationById = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const location = await PartLocation.findOne({
        _id: id,
        tenant: req.tenant,
    });

    if (!location) {
        return res.status(404).json({ message: 'Part location not found' });
    }

    res.status(200).json(location);
});

const updatePartLocation = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const location = await PartLocation.findOneAndUpdate(
        { _id: id, tenant: req.tenant },
        req.body,
        { new: true },
    );

    if (!location) {
        return res.status(404).json({ message: 'Part location not found' });
    }

    res.status(200).json(location);
});

const deletePartLocation = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const location = await PartLocation.findOneAndUpdate(
        { _id: id, tenant: req.tenant },
        { isActive: false },
        { new: true }
    );

    if (!location) {
        return res.status(404).json({ message: 'Part location not found' });
    }

    // Remove associated PartStock records for this location
    await PartStock.deleteMany({
        tenant: req.tenant,
        inventoryLocation: id
    });

    res.status(200).json({ ...location.toObject(), message: 'Part location deleted successfully and inventory records removed' });
});

export {
    createPartLocation,
    fetchPartLocations,
    fetchPartLocationById,
    updatePartLocation,
    deletePartLocation,
};
