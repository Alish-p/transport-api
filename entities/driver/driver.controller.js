import asyncHandler from 'express-async-handler';
import Driver from './driver.model.js';
import { addTenantToQuery } from '../../utils/tenant-utils.js';

const createDriver = asyncHandler(async (req, res) => {
  const driver = new Driver({
    ...req.body,
    driverName: req.body.driverName?.trim(),
    tenant: req.tenant,
  });
  const newDriver = await driver.save();
  res.status(201).json(newDriver);
});

const quickCreateDriver = asyncHandler(async (req, res) => {
  const { driverName, driverCellNo } = req.body;

  if (!driverName || !driverCellNo) {
    res.status(400).json({ message: 'driverName and driverCellNo are required' });
    return;
  }

  const now = new Date();

  const driver = new Driver({
    driverName: driverName.trim(),
    driverCellNo,
    driverLicenceNo: 'N/A',
    driverPresentAddress: 'N/A',
    licenseFrom: now,
    licenseTo: new Date(now.getFullYear() + 5, now.getMonth(), now.getDate()),
    aadharNo: 'N/A',
    experience: 0,
    permanentAddress: 'N/A',
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

export {
  createDriver,
  quickCreateDriver,
  fetchDrivers,
  fetchDriversSummary,
  fetchDriverById,
  updateDriver,
  deleteDriver,
};
