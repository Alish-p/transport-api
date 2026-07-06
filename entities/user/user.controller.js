import asyncHandler from 'express-async-handler';

import UserModel from './user.model.js';
import { buildSortObject } from '../../utils/query-utils.js';

// Create User
const createUser = asyncHandler(async (req, res) => {
  const body = { ...req.body };
  // Prevent privilege escalation: only superuser can set role
  if (!(req.user && req.user.role === 'super')) {
    delete body.role;
  }
  const newUser = await new UserModel({
    ...body,
    tenant: req.tenant,
  }).save();
  res.status(201).json(newUser);
});

// Fetch Users
const fetchUsers = asyncHandler(async (req, res) => {
  const { name, designation, permission, orderBy, order } = req.query;
  const { limit, skip } = req.pagination;

  const query = { tenant: req.tenant };

  if (name) {
    query.name = { $regex: name, $options: 'i' };
  }

  if (designation) {
    query.designation = { $regex: designation, $options: 'i' };
  }

  if (permission) {
    const searchTerms = permission
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (searchTerms.length > 0) {
      const andConditions = [];
      searchTerms.forEach((term) => {
        if (term.includes('.')) {
          andConditions.push({ [`permissions.${term}`]: true });
        } else {
          andConditions.push({
            $or: ['create', 'view', 'update', 'delete', 'approve'].map((act) => ({
              [`permissions.${term}.${act}`]: true,
            })),
          });
        }
      });
      if (andConditions.length > 0) {
        query.$and = andConditions;
      }
    }
  }

  const sortObj = buildSortObject(orderBy, order, { name: 1 });

  const [users, total] = await Promise.all([
    UserModel.find(query)
      .sort(sortObj)
      .collation({ locale: 'en', numericOrdering: true })
      .skip(skip)
      .limit(limit),
    UserModel.countDocuments(query),
  ]);

  res.status(200).json({
    users,
    total,
  });
});

// Export Users
const exportUsers = asyncHandler(async (req, res) => {
  const { name, designation, permission, columns, order, orderBy } = req.query;

  const query = { tenant: req.tenant };

  if (name) {
    query.name = { $regex: name, $options: 'i' };
  }

  if (designation) {
    query.designation = { $regex: designation, $options: 'i' };
  }

  if (permission) {
    const searchTerms = permission
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (searchTerms.length > 0) {
      const andConditions = [];
      searchTerms.forEach((term) => {
        if (term.includes('.')) {
          andConditions.push({ [`permissions.${term}`]: true });
        } else {
          andConditions.push({
            $or: ['create', 'view', 'update', 'delete', 'approve'].map((act) => ({
              [`permissions.${term}.${act}`]: true,
            })),
          });
        }
      });
      if (andConditions.length > 0) {
        query.$and = andConditions;
      }
    }
  }

  const COLUMN_MAPPING = {
    name: { header: 'Name', key: 'name', width: 25 },
    mobile: { header: 'Mobile', key: 'mobile', width: 15 },
    address: { header: 'Address', key: 'address', width: 30 },
    designation: { header: 'Designation', key: 'designation', width: 20 },
    lastSeen: { header: 'Last Seen', key: 'lastSeen', width: 25 },
  };

  let exportColumns = [];
  if (columns) {
    const columnIds = columns.split(',');
    exportColumns = columnIds.map((id) => COLUMN_MAPPING[id]).filter((col) => col);
  }

  if (exportColumns.length === 0) {
    exportColumns = Object.values(COLUMN_MAPPING);
  }

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=Users.xlsx');

  const ExcelJS = await import('exceljs');
  const workbook = new ExcelJS.default.stream.xlsx.WorkbookWriter({
    stream: res,
    useStyles: true,
  });

  const worksheet = workbook.addWorksheet('Users');
  worksheet.columns = exportColumns;

  const sortObj = buildSortObject(orderBy, order, { name: 1 });

  const cursor = UserModel.find(query).sort(sortObj).lean().cursor();

  for (let user = await cursor.next(); user != null; user = await cursor.next()) {
    const rowData = {};
    exportColumns.forEach((col) => {
      if (col.key === 'lastSeen') {
        rowData[col.key] = user.lastSeen ? new Date(user.lastSeen).toISOString() : 'Never';
      } else {
        rowData[col.key] = user[col.key] || '-';
      }
    });
    worksheet.addRow(rowData).commit();
  }

  await workbook.commit();
});

// Fetch Users Last Seen
const fetchUsersLastSeen = asyncHandler(async (req, res) => {
  const users = await UserModel.find({ tenant: req.tenant })
    .select("name lastSeen")
    .sort({ name: 1 });
  res.status(200).json(users);
});

// Fetch User
const fetchUser = asyncHandler(async (req, res) => {
  const user = await UserModel.findOne({
    _id: req.params.id,
    tenant: req.tenant,
  });
  res.status(200).json(user);
});

// Delete User
const deleteUser = asyncHandler(async (req, res) => {
  const user = await UserModel.findOneAndDelete({
    _id: req.params.id,
    tenant: req.tenant,
  });
  res.status(200).json(user);
});

// Update User
const updateUser = asyncHandler(async (req, res) => {
  const body = { ...req.body };
  // Prevent role changes here; use dedicated role endpoint
  if (!(req.user && req.user.role === 'super')) {
    delete body.role;
  }
  const user = await UserModel.findOneAndUpdate(
    { _id: req.params.id, tenant: req.tenant },
    body,
    { new: true }
  );
  res.status(200).json(user);
});

export {
  fetchUser,
  createUser,
  fetchUsers,
  deleteUser,
  updateUser,
  fetchUsersLastSeen,
  exportUsers,
};


