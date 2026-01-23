import CustomerTarget from './customerTarget.model.js';
import Subtrip from '../subtrip/subtrip.model.js';
import mongoose from 'mongoose';
import { SUBTRIP_STATUS } from '../subtrip/subtrip.constants.js';

export const createTarget = async (req, res, next) => {
    try {
        const { customer, materialTarget, month, year } = req.body;
        const tenant = req.user.tenant;

        // Ensure month is stored as the first day of the month
        const targetMonth = new Date(month);
        targetMonth.setDate(1);
        targetMonth.setHours(0, 0, 0, 0);

        const target = await CustomerTarget.findOneAndUpdate(
            {
                tenant,
                customer,
                'materialTarget.material': materialTarget.material,
                month: targetMonth,
                year,
            },
            {
                tenant,
                customer,
                materialTarget,
                month: targetMonth,
                year,
            },
            { new: true, upsert: true }
        );

        res.status(200).json(target);
    } catch (error) {
        next(error);
    }
};

export const updateTarget = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { materialTarget, month, year } = req.body;
        const tenant = req.user.tenant;

        const targetMonth = new Date(month);
        targetMonth.setDate(1);
        targetMonth.setHours(0, 0, 0, 0);

        const target = await CustomerTarget.findOneAndUpdate(
            { _id: id, tenant },
            {
                materialTarget,
                month: targetMonth,
                year,
            },
            { new: true }
        );

        if (!target) {
            return res.status(404).json({ message: 'Target not found' });
        }

        res.status(200).json(target);
    } catch (error) {
        next(error);
    }
};

export const getTargets = async (req, res, next) => {
    try {
        const tenant = req.user.tenant;
        const { month, year } = req.query;

        if (!month || !year) {
            return res.status(400).json({ message: 'Month and Year are required' });
        }

        const targetMonth = new Date(month);
        targetMonth.setDate(1);
        targetMonth.setHours(0, 0, 0, 0);

        // Calculate start and end date for the month to filter subtrips
        const startOfMonth = new Date(year, targetMonth.getMonth(), 1);
        const endOfMonth = new Date(year, targetMonth.getMonth() + 1, 0, 23, 59, 59, 999);

        const targets = await CustomerTarget.find({
            tenant,
            month: targetMonth,
            year: parseInt(year),
        })
            .populate('customer', 'customerName')
            .lean();

        // Calculate progress for each target
        const targetsWithProgress = await Promise.all(
            targets.map(async (target) => {
                const progress = await Subtrip.aggregate([
                    {
                        $match: {
                            tenant: new mongoose.Types.ObjectId(tenant),
                            customerId: new mongoose.Types.ObjectId(target.customer._id),
                            materialType: target.materialTarget.material,
                            subtripStatus: {
                                $in: [
                                    SUBTRIP_STATUS.LOADED,
                                    SUBTRIP_STATUS.RECEIVED,
                                    SUBTRIP_STATUS.BILLED,
                                ],
                            },
                            startDate: {
                                $gte: startOfMonth,
                                $lte: endOfMonth,
                            },
                        },
                    },
                    {
                        $group: {
                            _id: null,
                            totalWeight: { $sum: '$loadingWeight' },
                        },
                    },
                ]);

                return {
                    ...target,
                    achievedWeight: progress.length > 0 ? progress[0].totalWeight : 0,
                };
            })
        );

        res.status(200).json(targetsWithProgress);
    } catch (error) {
        next(error);
    }
};

export const deleteTarget = async (req, res, next) => {
    try {
        const { id } = req.params;
        const tenant = req.user.tenant;

        const target = await CustomerTarget.findOneAndDelete({ _id: id, tenant });

        if (!target) {
            return res.status(404).json({ message: 'Target not found' });
        }

        res.status(200).json({ message: 'Target deleted successfully' });
    } catch (error) {
        next(error);
    }
};
