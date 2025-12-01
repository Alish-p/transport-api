import asyncHandler from 'express-async-handler';
import Option from './option.model.js';

// @desc    Get options by group
// @route   GET /api/options/:group
// @access  Private
export const getOptions = asyncHandler(async (req, res) => {
    const { group } = req.params;
    const options = await Option.find({ tenant: req.tenant, group, isActive: true })
        .sort({ label: 1 })
        .select('label value isFixed _id');

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

    const optionExists = await Option.findOne({
        tenant: req.tenant,
        group,
        value,
    });

    if (optionExists) {
        return res.status(400).json({ message: 'Option with this value already exists' });
    }

    const option = await Option.create({
        tenant: req.tenant,
        group,
        label,
        value,
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

    option.label = label || option.label;
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
        const exists = await Option.findOne({ tenant: req.tenant, group, value: opt.value });
        if (!exists) {
            const newOpt = await Option.create({
                tenant: req.tenant,
                group,
                label: opt.label,
                value: opt.value,
                isFixed: opt.isFixed || false,
            });
            results.push(newOpt);
        }
    }

    res.status(200).json({ message: `Seeded ${results.length} options`, data: results });
});
