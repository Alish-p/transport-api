import asyncHandler from 'express-async-handler';
import Option from './option.model.js';
import Part from '../maintenanceAndInventory/part/part.model.js';
import Vehicle from '../vehicle/vehicle.model.js';

import WorkOrder from '../maintenanceAndInventory/workOrder/workOrder.model.js';

const USAGE_MODELS = {
    part: Part,
    vehicle: Vehicle,
    workOrder: WorkOrder,
};

const formatString = (str) => {
    if (!str) return str;
    return str
        .trim()
        .replace(/\s+/g, ' ') // Replace multiple spaces with single space
        .toLowerCase()
        .split(' ')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
};

// @desc    Get options by group
// @route   GET /api/options/:group
// @access  Private
export const getOptions = asyncHandler(async (req, res) => {
    const { group } = req.params;
    const { usageFor, usageField } = req.query;

    const options = await Option.find({ tenant: req.tenant, group, isActive: true })
        .sort({ label: 1 })
        .select('label value isFixed _id');

    // If usage tracking is requested
    if (usageFor && usageField) {
        let Model;

        // Dynamic model selection
        // We need to map usageFor string to actual Mongoose models
        // To avoid circular dependencies or complex imports, we can import them at the top
        // or use a mapping.
        switch (usageFor) {
            case 'part':
                // We need to ensure Part is imported. 
                // Since we can't easily do dynamic imports inside the function without async/await and path issues in some envs,
                // it is better to import them at top level.
                // But I will use the USAGE_MODELS map defined outside.
                Model = USAGE_MODELS[usageFor];
                break;
            case 'vehicle':
                Model = USAGE_MODELS[usageFor];
                break;
            case 'workOrder':
                Model = USAGE_MODELS[usageFor];
                break;
            default:
                break;
        }

        if (Model) {
            // Aggregate counts on the target collection
            const pipeline = [{ $match: { tenant: req.tenant } }];

            // Handle array unwinding if needed
            // If checking usage of individual items within an array (e.g. issues in WorkOrder)
            if (usageFor === 'workOrder' && usageField === 'issues.issue') {
                pipeline.push({ $unwind: '$issues' });
            }

            pipeline.push({ $group: { _id: `$${usageField}`, count: { $sum: 1 } } });

            const counts = await Model.aggregate(pipeline);

            // Create a map for O(1) lookup
            const countMap = counts.reduce((acc, curr) => {
                if (curr._id) {
                    acc[curr._id] = curr.count;
                }
                return acc;
            }, {});

            const optionsWithUsage = options.map((opt) => {
                const count = countMap[opt.value] || 0;
                const optObj = opt.toObject();

                optObj.usageFor = usageFor;
                optObj.usageCount = count;

                // Simple pluralization
                const suffix = count === 1 ? usageFor : `${usageFor}s`;
                optObj.usageLabel = `${count} ${suffix}`;

                return optObj;
            });

            return res.status(200).json(optionsWithUsage);
        }
    }

    res.status(200).json(options);
});

// @desc    Create a new option
// @route   POST /api/options
// @access  Private
export const createOption = asyncHandler(async (req, res) => {
    const { group, label, value } = req.body;

    if (!group || !label || !value) {
        return res.status(400).json({ message: 'Group, label, and value are required' });
    }

    const formattedLabel = formatString(label);
    const formattedValue = formatString(value);

    const optionExists = await Option.findOne({
        tenant: req.tenant,
        group,
        value: formattedValue,
    });

    if (optionExists) {
        return res.status(400).json({ message: 'Option with this value already exists' });
    }

    const option = await Option.create({
        tenant: req.tenant,
        group,
        label: formattedLabel,
        value: formattedValue,
        isFixed: false, // User created options are never fixed
    });

    res.status(201).json(option);
});

// @desc    Update an option
// @route   PUT /api/options/:id
// @access  Private
export const updateOption = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { label, isActive } = req.body;

    const option = await Option.findOne({ _id: id, tenant: req.tenant });

    if (!option) {
        return res.status(404).json({ message: 'Option not found' });
    }

    if (option.isFixed) {
        // For fixed options, maybe we only allow changing the label (display name) but not the value?
        // Or maybe we don't allow editing at all. The user said "user cant edit or delete these".
        // However, sometimes renaming "Petrol" to "Gasoline" might be desired even if the system value is fixed.
        // For now, I'll block editing if it's fixed, or maybe just allow isActive toggle?
        // The user said "Diesel and Petrol is FIXED user cant edit or delete these".
        return res.status(403).json({ message: 'Cannot edit a fixed system option' });
    }

    if (label) {
        option.label = formatString(label);
    }
    if (isActive !== undefined) option.isActive = isActive;

    const updatedOption = await option.save();
    res.status(200).json(updatedOption);
});

// @desc    Delete an option
// @route   DELETE /api/options/:id
// @access  Private
export const deleteOption = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const option = await Option.findOne({ _id: id, tenant: req.tenant });

    if (!option) {
        return res.status(404).json({ message: 'Option not found' });
    }

    if (option.isFixed) {
        return res.status(403).json({ message: 'Cannot delete a fixed system option' });
    }

    await option.deleteOne();
    res.status(200).json({ message: 'Option removed' });
});

// @desc    Seed default options for a group
// @route   POST /api/options/seed
// @access  Private
export const seedOptions = asyncHandler(async (req, res) => {
    const { group, options } = req.body; // options: [{ label, value, isFixed }]

    if (!group || !Array.isArray(options)) {
        return res.status(400).json({ message: 'Group and options array are required' });
    }

    const results = [];
    for (const opt of options) {
        const formattedValue = formatString(opt.value);
        const exists = await Option.findOne({ tenant: req.tenant, group, value: formattedValue });
        if (!exists) {
            const newOpt = await Option.create({
                tenant: req.tenant,
                group,
                label: formatString(opt.label),
                value: formattedValue,
                isFixed: opt.isFixed || false,
            });
            results.push(newOpt);
        }
    }

    res.status(200).json({ message: `Seeded ${results.length} options`, data: results });
});
