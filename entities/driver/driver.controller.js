import asyncHandler from 'express-async-handler';
import {
  createDriver as createDriverService,
  quickCreateDriver as quickCreateDriverService,
  fetchDrivers as fetchDriversService,
  fetchDriversSummary as fetchDriversSummaryService,
  fetchDriverById as fetchDriverByIdService,
  updateDriver as updateDriverService,
  deleteDriver as deleteDriverService,
} from './driver.service.js';

const createDriver = asyncHandler(async (req, res) => {
  const driver = await createDriverService(req.body, req.tenant);
  res.status(201).json(driver);
});

const quickCreateDriver = asyncHandler(async (req, res) => {
  const driver = await quickCreateDriverService(req.body, req.tenant);
  res.status(201).json(driver);
});

const fetchDrivers = asyncHandler(async (req, res) => {
  const { search } = req.query;
  const { limit, skip } = req.pagination;
  const result = await fetchDriversService({ search, limit, skip }, req.tenant);
  res.status(200).json(result);
});

const fetchDriversSummary = asyncHandler(async (req, res) => {
  const drivers = await fetchDriversSummaryService(req.tenant);
  res.status(200).json(drivers);
});

const fetchDriverById = asyncHandler(async (req, res) => {
  const driver = await fetchDriverByIdService(req.params.id, req.tenant);
  if (!driver) {
    res.status(404).json({ message: 'Driver not found' });
  } else {
    res.status(200).json(driver);
  }
});

const updateDriver = asyncHandler(async (req, res) => {
  const driver = await updateDriverService(req.params.id, req.body, req.tenant);
  res.status(200).json(driver);
});

const deleteDriver = asyncHandler(async (req, res) => {
  const driver = await deleteDriverService(req.params.id, req.tenant);
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
