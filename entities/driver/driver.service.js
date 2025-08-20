import Driver from './driver.model.js';
import Trip from '../trip/trip.model.js';
import Subtrip from '../subtrip/subtrip.model.js';
import { addTenantToQuery } from '../../utils/tenant-utils.js';

const createDriver = async (data, tenant) => {
  const driver = new Driver({
    ...data,
    driverName: data.driverName.trim(),
    tenant,
  });
  const newDriver = await driver.save();
  return newDriver;
};

const quickCreateDriver = async (data, tenant) => {
  const { driverName, driverCellNo } = data;

  if (!driverName || !driverCellNo) {
    throw new Error('driverName and driverCellNo are required');
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
    tenant,
  });

  const newDriver = await driver.save();
  return newDriver;
};

const fetchDrivers = async ({ search, limit, skip }, tenant) => {
  const query = addTenantToQuery({ tenant });

  if (search) {
    query.$or = [
      { driverName: { $regex: search, $options: 'i' } },
      { driverCellNo: { $regex: search, $options: 'i' } },
    ];
  }

  const now = new Date();

  const [drivers, totalAll, validCount] = await Promise.all([
    Driver.find(query)
      .select(
        '-guarantorName -guarantorCellNo -dob -dlImage -photoImage -aadharImage -bankDetails'
      )
      .sort({ driverName: 1 })
      .skip(skip)
      .limit(limit),
    Driver.countDocuments(query),
    Driver.countDocuments({ ...query, licenseTo: { $gte: now } }),
  ]);

  return {
    drivers,
    totals: {
      all: { count: totalAll },
      valid: { count: validCount },
      expired: { count: totalAll - validCount },
    },
    startRange: skip + 1,
    endRange: skip + drivers.length,
  };
};

const fetchDriversSummary = async (tenant) =>
  Driver.find({ tenant }).select('driverName driverCellNo');

const fetchDriverById = async (id, tenant) =>
  Driver.findOne({ _id: id, tenant });

const updateDriver = async (id, data, tenant) =>
  Driver.findOneAndUpdate({ _id: id, tenant }, data, { new: true });

const deleteDriver = async (id, tenant) =>
  Driver.findOneAndDelete({ _id: id, tenant });

export {
  createDriver,
  quickCreateDriver,
  fetchDrivers,
  fetchDriversSummary,
  fetchDriverById,
  updateDriver,
  deleteDriver,
};
