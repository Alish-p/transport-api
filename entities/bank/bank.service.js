import bankRepo from './bank.repo.js';
import { addTenantToQuery } from '../../utills/tenant-utils.js';
import { BANK_SEARCHABLE_FIELDS } from './bank.constants.js';

const createBank = (data, tenant) => bankRepo.create({ ...data, tenant });

const fetchBanks = async (search, pagination, tenant) => {
  const { limit, skip } = pagination;
  const query = addTenantToQuery({ tenant });

  if (search) {
    query.$or = BANK_SEARCHABLE_FIELDS.map((field) => ({
      [field]: { $regex: search, $options: 'i' },
    }));
  }

  const [banks, total] = await Promise.all([
    bankRepo.find(query, { sort: { name: 1 }, skip, limit }),
    bankRepo.countDocuments(query),
  ]);

  return {
    banks,
    total,
    startRange: skip + 1,
    endRange: skip + banks.length,
  };
};

const fetchBankById = (id, tenant) => bankRepo.findOne({ _id: id, tenant });

const updateBank = (id, data, tenant) =>
  bankRepo.findOneAndUpdate({ _id: id, tenant }, data, { new: true });

const deleteBank = (id, tenant) =>
  bankRepo.findOneAndDelete({ _id: id, tenant });

export default {
  createBank,
  fetchBanks,
  fetchBankById,
  updateBank,
  deleteBank,
};
