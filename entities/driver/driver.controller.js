import asyncHandler from 'express-async-handler';
import Driver from './driver.model.js';
import Subtrip from '../subtrip/subtrip.model.js';
import Trip from '../trip/trip.model.js';
import DriverSalary from '../driverSalary/driverSalary.model.js';
import Loan from '../loan/loan.model.js';
import { addTenantToQuery } from '../../utils/tenant-utils.js';
import { buildPublicFileUrl, createPresignedPutUrl } from '../../services/s3.service.js';
import dayjs from 'dayjs';

const createDriver = asyncHandler(async (req, res) => {
  const { driverName, driverCellNo } = req.body;

  if (!driverName || !driverCellNo) {
    res.status(400).json({ message: 'driverName and driverCellNo are required' });
    return;
  }

  // Check if driver with same cell number already exists
  const existingDriver = await Driver.findOne({
    driverCellNo,
    tenant: req.tenant,
  });

  if (existingDriver) {
    if (existingDriver.isActive) {
      res.status(400).json({ message: 'Driver with this mobile number already exists.' });
      return;
    }

    // If driver exists but is inactive, reactivate and update details
    const updatedDriver = await Driver.findByIdAndUpdate(
      existingDriver._id,
      {
        ...req.body,
        driverName: driverName.trim(),
        isActive: true, // Reactivate
      },
      { new: true }
    );

    res.status(200).json(updatedDriver);
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
  const { search, status, isActive, driverType } = req.query;
  const { limit, skip } = req.pagination;

  const query = addTenantToQuery({ tenant: req.tenant });

  if (typeof isActive !== 'undefined') {
    query.isActive = isActive === "true" || isActive === true || isActive === "1";
  }

  // Filter by driver type (Own / Market)
  if (driverType) {
    query.type = driverType;
  }

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
      .lean()
      .sort({ driverName: 1 })
      .skip(skip)
      .limit(limit),
    Driver.countDocuments(query),
    Driver.countDocuments({ ...query, licenseTo: { $gte: now } }),
    Driver.countDocuments(filterQuery),
  ]);

  const driverIds = drivers.map((d) => d._id);

  // Safely aggregate first and last job dates for these drivers
  const subtripStatsArr = await Subtrip.aggregate([
    {
      $match: {
        driverId: { $in: driverIds },
        tenant: req.tenant,
        startDate: { $type: 'date' },
      },
    },
    {
      $group: {
        _id: '$driverId',
        firstJobAt: { $min: '$startDate' },
        lastJobAt: { $max: '$startDate' },
      },
    },
  ]);

  const subtripStatsMap = subtripStatsArr.reduce((acc, stat) => {
    acc[stat._id.toString()] = {
      firstJobAt: stat.firstJobAt,
      lastJobAt: stat.lastJobAt,
    };
    return acc;
  }, {});

  const enrichedDrivers = drivers.map((d) => ({
    ...d,
    firstJobAt: subtripStatsMap[d._id.toString()]?.firstJobAt || null,
    lastJobAt: subtripStatsMap[d._id.toString()]?.lastJobAt || null,
  }));

  res.status(200).json({
    drivers: enrichedDrivers,
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

// GET presigned URL for driver photo upload
const getPhotoUploadUrl = asyncHandler(async (req, res) => {
  const { contentType, fileExtension } = req.query;

  if (!contentType || !fileExtension) {
    res.status(400);
    throw new Error('contentType and fileExtension are required');
  }

  const tenantStr = String(req.tenant);

  const timestamp = Date.now();
  const rand = Math.floor(Math.random() * 10000);

  const s3Key = `logos/drivers/${tenantStr}/photos/driver_${timestamp}_${rand}.${fileExtension}`;

  try {
    const uploadUrl = await createPresignedPutUrl({ key: s3Key, contentType, expiresIn: 900 });

    const base = process.env.AWS_PUBLIC_BASE_URL;
    const publicKey = s3Key.replace(/^logos\//, '');
    const publicUrl = base
      ? `${base.replace(/\/$/, '')}/${publicKey}`
      : (buildPublicFileUrl(s3Key) || null);

    return res.status(200).json({ key: s3Key, uploadUrl, publicUrl });
  } catch (err) {
    console.error('Failed to create driver photo upload url:', err);
    return res.status(500).json({ message: 'Failed to create upload URL', error: err.message });
  }
});

export const exportDrivers = asyncHandler(async (req, res) => {
  const { search, status, isActive, driverType, columns } = req.query;

  const query = addTenantToQuery({ tenant: req.tenant });

  if (typeof isActive !== 'undefined') {
    query.isActive = isActive === "true" || isActive === true || isActive === "1";
  }

  if (driverType) {
    query.type = driverType;
  }

  if (search) {
    query.$or = [
      { driverName: { $regex: search, $options: 'i' } },
      { driverCellNo: { $regex: search, $options: 'i' } },
    ];
  }

  const now = new Date();
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

  const COLUMN_MAPPING = {
    driverName: { header: 'Driver', key: 'driverName', width: 25 },
    type: { header: 'Type', key: 'type', width: 15 },
    driverCellNo: { header: 'Mobile', key: 'driverCellNo', width: 20 },
    permanentAddress: { header: 'Address', key: 'permanentAddress', width: 30 },
    experience: { header: 'Experience', key: 'experience', width: 15 },
    licenseTo: { header: 'License Valid Till', key: 'licenseTo', width: 20 },
    aadharNo: { header: 'Aadhar No', key: 'aadharNo', width: 20 },
    status: { header: 'Status', key: 'status', width: 15 },
    isActive: { header: 'Active', key: 'isActive', width: 15 },
    iitrition: { header: 'Duration', key: 'iitrition', width: 30 },
  };

  let exportColumns = [];
  if (columns) {
    const columnIds = columns.split(',');
    exportColumns = columnIds.map((id) => COLUMN_MAPPING[id]).filter(Boolean);
  }

  if (exportColumns.length === 0) {
    exportColumns = [
      COLUMN_MAPPING.driverName,
      COLUMN_MAPPING.type,
      COLUMN_MAPPING.driverCellNo,
      COLUMN_MAPPING.status,
    ];
  }

  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  res.setHeader("Content-Disposition", "attachment; filename=Drivers.xlsx");

  const ExcelJS = await import('exceljs');
  const workbook = new ExcelJS.default.stream.xlsx.WorkbookWriter({
    stream: res,
    useStyles: true,
  });

  const worksheet = workbook.addWorksheet('Drivers');
  worksheet.columns = exportColumns;
  
  const drivers = await Driver.find(filterQuery)
    .select('_id driverName type driverCellNo permanentAddress experience licenseTo aadharNo isActive')
    .sort({ driverName: 1 })
    .lean();
    
  const driverIds = drivers.map(d => d._id);

  const subtripStatsArr = await Subtrip.aggregate([
    {
      $match: {
        driverId: { $in: driverIds },
        tenant: req.tenant,
        startDate: { $type: 'date' },
      },
    },
    {
      $group: {
        _id: '$driverId',
        firstJobAt: { $min: '$startDate' },
        lastJobAt: { $max: '$startDate' },
      },
    },
  ]);
  
  const subtripStatsMap = {};
  subtripStatsArr.forEach(stat => {
    subtripStatsMap[stat._id.toString()] = stat;
  });

  for (const doc of drivers) {
    const row = {};
    const firstJobAt = subtripStatsMap[doc._id.toString()]?.firstJobAt;
    const lastJobAt = subtripStatsMap[doc._id.toString()]?.lastJobAt;

    exportColumns.forEach((col) => {
      const key = col.key;
      
      if (key === 'status') {
         const licDate = doc.licenseTo ? new Date(doc.licenseTo) : null;
         row[key] = licDate && licDate > now ? 'valid' : 'expired';
      } else if (key === 'isActive') {
         row[key] = doc.isActive === false ? 'Inactive' : 'Active';
      } else if (key === 'licenseTo') {
         row[key] = doc.licenseTo ? new Date(doc.licenseTo).toISOString().split('T')[0] : '-';
      } else if (key === 'iitrition') {
         if (firstJobAt && lastJobAt) {
           const startStr = dayjs(firstJobAt).format('MM-YYYY');
           const endStr = dayjs(lastJobAt).format('MM-YYYY');
           row[key] = `${startStr} to ${endStr}`;
         } else {
           row[key] = '-';
         }
      } else {
         row[key] = doc[key] || '-';
      }
    });

    worksheet.addRow(row).commit();
  }

  worksheet.commit();
  await workbook.commit();
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
  getPhotoUploadUrl,
};
