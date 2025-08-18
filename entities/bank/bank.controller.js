import asyncHandler from 'express-async-handler';
import Bank from './bank.model.js';
import { addTenantToQuery } from '../../utils/tenant-utils.js';
import { BANK_SEARCHABLE_FIELDS } from './bank.constants.js';

const createBank = asyncHandler(async (req, res) => {
  const newBank = await Bank.create({ ...req.body, tenant: req.tenant });
  res.status(201).json(newBank);
});

const fetchBanks = asyncHandler(async (req, res) => {
  const { search } = req.query;
  const { limit, skip } = req.pagination;
  const query = addTenantToQuery(req);

  if (search) {
    query.$or = BANK_SEARCHABLE_FIELDS.map((field) => ({
      [field]: { $regex: search, $options: 'i' },
    }));
  }

  const [banks, total] = await Promise.all([
    Bank.find(query, null, { sort: { name: 1 }, skip, limit }),
    Bank.countDocuments(query),
  ]);

  res.status(200).json({
    banks,
    total,
    startRange: skip + 1,
    endRange: skip + banks.length,
  });
});

const fetchBankDetails = asyncHandler(async (req, res) => {
  const bank = await Bank.findOne({ _id: req.params.id, tenant: req.tenant });
  if (!bank) {
    res.status(404).json({ message: 'Bank not found' });
    return;
  }
  res.status(200).json(bank);
});

const updateBank = asyncHandler(async (req, res) => {
  const bank = await Bank.findOneAndUpdate(
    { _id: req.params.id, tenant: req.tenant },
    req.body,
    { new: true },
  );
  res.status(200).json(bank);
});

const deleteBank = asyncHandler(async (req, res) => {
  const bank = await Bank.findOneAndDelete({
    _id: req.params.id,
    tenant: req.tenant,
  });
  res.status(200).json(bank);
});

export { createBank, fetchBanks, updateBank, deleteBank, fetchBankDetails };
