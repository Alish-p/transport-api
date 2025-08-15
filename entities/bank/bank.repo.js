import Bank from './bank.model.js';

const create = (data) => Bank.create(data);

const find = (filter, options = {}) => Bank.find(filter, null, options);

const findOne = (filter) => Bank.findOne(filter);

const findOneAndUpdate = (filter, update, options) =>
  Bank.findOneAndUpdate(filter, update, options);

const findOneAndDelete = (filter) => Bank.findOneAndDelete(filter);

const countDocuments = (filter) => Bank.countDocuments(filter);

export default {
  create,
  find,
  findOne,
  findOneAndUpdate,
  findOneAndDelete,
  countDocuments,
};
