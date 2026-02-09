import asyncHandler from 'express-async-handler';
import Driver from './driver.model.js';
import Subtrip from '../subtrip/subtrip.model.js';
import Trip from '../trip/trip.model.js';
import DriverSalary from '../driverSalary/driverSalary.model.js';
import Loan from '../loan/loan.model.js';
import { addTenantToQuery } from '../../utils/tenant-utils.js';

const createDriver = asyncHandler(async (req, res) => {
  const { driverName, driverCellNo } = req.body;

  if (!driverName || !driverCellNo) {
    res.status(400).json({ message: 'driverName and driverCellNo are required' });
    return;
  }

  const driver = new Driver({
    ...req.body,
    driverName: driverName.trim(),
    tenant: req.tenant,
  });
  const newDriver = await driver.save();
  res.status(201).json(newDriver);
});

const fetchDrivers = asyncHandler(async (req, res) => {
  /* eslint-disable no-unused-vars */
  const { search, status } = req.query;
  const { limit, skip } = req.pagination;

  const query = addTenantToQuery({ tenant: req.tenant });

  if (search) {
    query.$or = [
      { driverName: { $regex: search, $options: 'i' } },
      { driverCellNo: { $regex: search, $options: 'i' } },
    ];
  }

  const now = new Date();

  // Clone query for filtering to preserve base query for counts
  let filterQuery = { ...query };

  if (status === 'valid') {
    filterQuery.licenseTo = { $gte: now };
  } else if (status === 'expired') {
    const expiredCondition = {
      $or: [{ licenseTo: { $lt: now } }, { licenseTo: { $exists: false } }, { licenseTo: null }],
    };

    if (filterQuery.$or) {
      filterQuery = {
        $and: [filterQuery, expiredCondition],
      };
    } else {
      filterQuery = { ...filterQuery, ...expiredCondition };
    }
  }

  const [drivers, totalAll, validCount, filteredCount] = await Promise.all([
    Driver.find(filterQuery)
      .select(
        '-guarantorName -guarantorCellNo -dob -dlImage -photoImage -aadharImage -bankDetails'
      )
      .sort({ driverName: 1 })
      .skip(skip)
      .limit(limit),
    Driver.countDocuments(query),
    Driver.countDocuments({ ...query, licenseTo: { $gte: now } }),
    Driver.countDocuments(filterQuery),
  ]);

  res.status(200).json({
    drivers,
    total: filteredCount,
    totals: {
      all: { count: totalAll },
      valid: { count: validCount },
      expired: { count: totalAll - validCount },
    },
    startRange: skip + 1,
    endRange: skip + drivers.length,
  });
});

const fetchDriversSummary = asyncHandler(async (req, res) => {
  const drivers = await Driver.find({ tenant: req.tenant }).select(
    'driverName driverCellNo'
  );
  res.status(200).json(drivers);
});

const fetchDriverById = asyncHandler(async (req, res) => {
  const driver = await Driver.findOne({ _id: req.params.id, tenant: req.tenant });
  if (!driver) {
    res.status(404).json({ message: 'Driver not found' });
  } else {
    res.status(200).json(driver);
  }
});

const updateDriver = asyncHandler(async (req, res) => {
  const driver = await Driver.findOneAndUpdate(
    { _id: req.params.id, tenant: req.tenant },
    req.body,
    { new: true }
  );
  res.status(200).json(driver);
});

const deleteDriver = asyncHandler(async (req, res) => {
  const driver = await Driver.findOneAndDelete({
    _id: req.params.id,
    tenant: req.tenant,
  });
  res.status(200).json(driver);
});

/**
 * Fetch all orphan drivers - drivers not referenced in any subtrip, trip, salary, or loan
 */
const fetchOrphanDrivers = asyncHandler(async (req, res) => {
  const tenant = req.tenant;

  // Get all driver IDs that ARE referenced in related collections
  const [subtripDriverIds, tripDriverIds, salaryDriverIds, loanDriverIds] = await Promise.all([
    Subtrip.distinct('driverId', { tenant }),
    Trip.distinct('driverId', { tenant }),
    DriverSalary.distinct('driverId', { tenant }),
    Loan.distinct('borrowerId', { tenant, borrowerType: 'Driver' }),
  ]);

  // Combine all referenced driver IDs
  const referencedDriverIds = [
    ...subtripDriverIds,
    ...tripDriverIds,
    ...salaryDriverIds,
    ...loanDriverIds,
  ];

  // Find active drivers NOT in the referenced list
  const orphanDrivers = await Driver.find({
    tenant,
    isActive: true,
    _id: { $nin: referencedDriverIds },
  })
    .select('driverName driverCellNo createdAt')
    .sort({ driverName: 1 });

  res.status(200).json({
    orphanDrivers,
    count: orphanDrivers.length,
  });
});

/**
 * Soft delete (cleanup) selected drivers by setting isActive to false
 */
const cleanupDrivers = asyncHandler(async (req, res) => {
  const { driverIds } = req.body;
  const tenant = req.tenant;

  if (!driverIds || !Array.isArray(driverIds) || driverIds.length === 0) {
    res.status(400).json({ message: 'driverIds array is required' });
    return;
  }

  // Update all selected drivers to inactive
  const result = await Driver.updateMany(
    { _id: { $in: driverIds }, tenant },
    { $set: { isActive: false } }
  );

  res.status(200).json({
    message: `${result.modifiedCount} driver(s) cleaned up successfully`,
    modifiedCount: result.modifiedCount,
  });
});

export {
  createDriver,
  fetchDrivers,
  fetchDriversSummary,
  fetchDriverById,
  updateDriver,
  deleteDriver,
  fetchOrphanDrivers,
  cleanupDrivers,
};

