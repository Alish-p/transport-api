import asyncHandler from 'express-async-handler';
import bankService from './bank.service.js';

const createBank = asyncHandler(async (req, res) => {
  const newBank = await bankService.createBank(req.body, req.tenant);
  res.status(201).json(newBank);
});

const fetchBanks = asyncHandler(async (req, res) => {
  const { search } = req.query;
  const { limit, skip } = req.pagination;
  const result = await bankService.fetchBanks(search, { limit, skip }, req.tenant);
  res.status(200).json(result);
});

const fetchBankDetails = asyncHandler(async (req, res) => {
  const bank = await bankService.fetchBankById(req.params.id, req.tenant);
  if (!bank) {
    res.status(404).json({ message: 'Bank not found' });
    return;
  }
  res.status(200).json(bank);
});

const updateBank = asyncHandler(async (req, res) => {
  const bank = await bankService.updateBank(req.params.id, req.body, req.tenant);
  res.status(200).json(bank);
});

const deleteBank = asyncHandler(async (req, res) => {
  const bank = await bankService.deleteBank(req.params.id, req.tenant);
  res.status(200).json(bank);
});

export { createBank, fetchBanks, updateBank, deleteBank, fetchBankDetails };
