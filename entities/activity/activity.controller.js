import asyncHandler from 'express-async-handler';
import Activity from './activity.model.js';
import { addTenantToQuery } from '../../utils/tenant-utils.js';

const fetchActivity = asyncHandler(async (req, res) => {
    const { entityType, entityId } = req.params;
    const { limit, skip } = req.pagination;

    const query = addTenantToQuery(req, {
        entity: entityId,
        entityType
    });

    const [activities, total] = await Promise.all([
        Activity.find(query)
            .sort({ timestamp: -1 })
            .skip(skip)
            .limit(limit)
            .lean(),
        Activity.countDocuments(query)
    ]);

    res.status(200).json({
        activities,
        total,
        startRange: skip + 1,
        endRange: skip + activities.length
    });
});

export { fetchActivity };
