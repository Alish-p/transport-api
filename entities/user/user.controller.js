import asyncHandler from 'express-async-handler';

import UserModel from './user.model.js';
import { buildSortObject } from '../../utils/query-utils.js';
import TenantMembership from '../tenantMembership/tenantMembership.model.js';

// Format membership + user into a unified response object
const formatMemberUser = (membership, userDoc = null) => {
  const u = userDoc || membership.user;
  const uObj = u && typeof u.toObject === 'function' ? u.toObject() : u || {};
  return {
    ...uObj,
    _id: uObj._id || membership.user,
    membershipId: membership._id,
    designation: membership.designation || uObj.designation || '',
    role: membership.role || uObj.role || 'user',
    permissions: membership.permissions || {},
    status: membership.status || 'active',
    tenant: membership.tenant,
    createdAt: membership.createdAt || uObj.createdAt,
    updatedAt: membership.updatedAt || uObj.updatedAt,
  };
};

// Create or Link User to Active Company
const createUser = asyncHandler(async (req, res) => {
  const body = { ...req.body };

  // Prevent privilege escalation: only superuser can set role
  if (!(req.user && req.user.role === 'super')) {
    delete body.role;
  }
  // Prevent setting tenant permissions via API; tenant permissions must be edited manually in DB
  if (body.permissions) {
    delete body.permissions.tenant;
  }

  const email = body.email ? body.email.toLowerCase().trim() : null;
  const mobile = body.mobile ? body.mobile.trim() : null;

  if (!email || !mobile) {
    return res.status(400).json({ message: 'Email and mobile number are required' });
  }

  // 1. Check if user already exists across the platform
  let user = await UserModel.findOne({
    $or: [{ email }, { mobile }],
  });

  if (user) {
    // 2. Check if user is already a member of the current tenant
    const existingMembership = await TenantMembership.findOne({
      user: user._id,
      tenant: req.tenant,
    });

    if (existingMembership) {
      return res.status(400).json({ message: 'User is already a member of this company' });
    }

    // 3. Link existing user to current company with designated permissions
    const membership = await new TenantMembership({
      user: user._id,
      tenant: req.tenant,
      designation: body.designation || '',
      role: body.role || 'user',
      permissions: body.permissions || {},
      status: 'active',
    }).save();

    return res.status(201).json(formatMemberUser(membership, user));
  }

  // 4. Create brand new global user
  user = await new UserModel({
    ...body,
    email,
    mobile,
    lastActiveTenant: req.tenant,
  }).save();

  // 5. Create company membership
  const membership = await new TenantMembership({
    user: user._id,
    tenant: req.tenant,
    designation: body.designation || '',
    role: body.role || 'user',
    permissions: body.permissions || {},
    status: 'active',
    isDefault: true,
  }).save();

  return res.status(201).json(formatMemberUser(membership, user));
});

// Helper to build permission query condition
const buildPermissionQueryCondition = (permission) => {
  if (!permission) return null;
  const searchTerms = permission
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (searchTerms.length === 0) return null;

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

  return andConditions.length > 0 ? { $and: andConditions } : null;
};

// Fetch Users for Current Company
const fetchUsers = asyncHandler(async (req, res) => {
  const { name, designation, permission, orderBy, order } = req.query;
  const { limit, skip } = req.pagination;

  const membershipQuery = { tenant: req.tenant };

  if (designation) {
    membershipQuery.designation = { $regex: designation, $options: 'i' };
  }

  const permCondition = buildPermissionQueryCondition(permission);
  if (permCondition) {
    membershipQuery.$and = permCondition.$and;
  }

  if (name) {
    const matchingUsers = await UserModel.find({
      name: { $regex: name, $options: 'i' },
    }).select('_id');
    const userIds = matchingUsers.map((u) => u._id);
    membershipQuery.user = { $in: userIds };
  }

  const sortObj = buildSortObject(orderBy, order, { createdAt: -1 });

  const [memberships, total] = await Promise.all([
    TenantMembership.find(membershipQuery)
      .populate({
        path: 'user',
        select: '-password',
      })
      .sort(sortObj)
      .skip(skip)
      .limit(limit),
    TenantMembership.countDocuments(membershipQuery),
  ]);

  const users = memberships
    .filter((m) => m.user)
    .map((m) => formatMemberUser(m));

  return res.status(200).json({
    users,
    total,
  });
});

// Export Users for Current Company
const exportUsers = asyncHandler(async (req, res) => {
  const { name, designation, permission, columns, order, orderBy } = req.query;

  const COLUMN_MAPPING = {
    name: { header: 'Name', key: 'name', width: 25 },
    email: { header: 'Email', key: 'email', width: 25 },
    mobile: { header: 'Mobile', key: 'mobile', width: 15 },
    address: { header: 'Address', key: 'address', width: 30 },
    designation: { header: 'Designation', key: 'designation', width: 20 },
    lastSeen: { header: 'Last Seen', key: 'lastSeen', width: 25 },
  };

  let exportColumns = [];
  if (columns) {
    const columnIds = columns.split(',');
    exportColumns = columnIds.map((id) => COLUMN_MAPPING[id]).filter(Boolean);
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

  const membershipQuery = { tenant: req.tenant };
  if (designation) membershipQuery.designation = { $regex: designation, $options: 'i' };
  const permCondition = buildPermissionQueryCondition(permission);
  if (permCondition) membershipQuery.$and = permCondition.$and;

  if (name) {
    const matchingUsers = await UserModel.find({
      name: { $regex: name, $options: 'i' },
    }).select('_id');
    membershipQuery.user = { $in: matchingUsers.map((u) => u._id) };
  }

  const sortObj = buildSortObject(orderBy, order, { createdAt: -1 });
  const cursor = TenantMembership.find(membershipQuery)
    .populate('user', '-password')
    .sort(sortObj)
    .lean()
    .cursor();

  for (let membership = await cursor.next(); membership != null; membership = await cursor.next()) {
    if (!membership.user) continue;
    const formatted = formatMemberUser(membership);
    const rowData = {};
    exportColumns.forEach((col) => {
      if (col.key === 'lastSeen') {
        rowData[col.key] = formatted.lastSeen ? new Date(formatted.lastSeen).toISOString() : 'Never';
      } else {
        rowData[col.key] = formatted[col.key] || '-';
      }
    });
    worksheet.addRow(rowData).commit();
  }

  await workbook.commit();
});

// Fetch Users Last Seen for Current Company
const fetchUsersLastSeen = asyncHandler(async (req, res) => {
  const memberships = await TenantMembership.find({ tenant: req.tenant })
    .populate({ path: 'user', select: 'name lastSeen' })
    .lean();

  const users = memberships
    .filter((m) => m.user)
    .map((m) => ({
      _id: m.user._id,
      name: m.user.name,
      lastSeen: m.user.lastSeen,
    }))
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  return res.status(200).json(users);
});

// Fetch Single User in Current Company
const fetchUser = asyncHandler(async (req, res) => {
  const membership = await TenantMembership.findOne({
    user: req.params.id,
    tenant: req.tenant,
  }).populate('user', '-password');

  if (!membership || !membership.user) {
    return res.status(404).json({ message: 'User not found in this company' });
  }

  return res.status(200).json(formatMemberUser(membership));
});

// Delete User from Current Company (if last membership, remove global user account)
const deleteUser = asyncHandler(async (req, res) => {
  const userId = req.params.id;

  // 1. Remove company membership
  const deletedMembership = await TenantMembership.findOneAndDelete({
    user: userId,
    tenant: req.tenant,
  });

  if (!deletedMembership) {
    return res.status(404).json({ message: 'User is not a member of this company' });
  }

  // 2. Check remaining company memberships for this user
  const remainingMemberships = await TenantMembership.find({ user: userId });

  if (remainingMemberships.length === 0) {
    // If user has no remaining company memberships anywhere and is not superuser, remove User account
    const user = await UserModel.findById(userId);
    if (user && user.role !== 'super') {
      await UserModel.findByIdAndDelete(userId);
    }
  } else {
    // Update user's lastActiveTenant to one of their remaining active companies
    await UserModel.updateOne(
      { _id: userId, lastActiveTenant: req.tenant },
      { $set: { lastActiveTenant: remainingMemberships[0].tenant } }
    );
  }

  return res.status(200).json({
    message: 'User removed from company successfully',
    deletedMembershipId: deletedMembership._id,
  });
});

// Update User within Current Company
const updateUser = asyncHandler(async (req, res) => {
  const body = { ...req.body };

  // Prevent role changes here unless superuser
  if (!(req.user && req.user.role === 'super')) {
    delete body.role;
  }

  const membership = await TenantMembership.findOne({
    user: req.params.id,
    tenant: req.tenant,
  });

  if (!membership) {
    return res.status(404).json({ message: 'User not found in this company' });
  }

  if (body.designation !== undefined) {
    membership.designation = body.designation;
  }
  if (body.role !== undefined) {
    membership.role = body.role;
  }
  if (body.permissions) {
    // Preserve existing permissions.tenant from DB
    if (membership.permissions?.tenant) {
      body.permissions.tenant = membership.permissions.tenant;
    } else {
      delete body.permissions.tenant;
    }
    membership.permissions = body.permissions;
  }
  await membership.save();

  // Update global user profile fields if provided
  const userUpdateFields = {};
  if (body.name) userUpdateFields.name = body.name;
  if (body.address) userUpdateFields.address = body.address;
  if (body.mobile) userUpdateFields.mobile = body.mobile;
  if (body.bankDetails) userUpdateFields.bankDetails = body.bankDetails;

  let updatedUser = null;
  if (Object.keys(userUpdateFields).length > 0) {
    updatedUser = await UserModel.findByIdAndUpdate(
      req.params.id,
      userUpdateFields,
      { new: true }
    ).select('-password');
  } else {
    updatedUser = await UserModel.findById(req.params.id).select('-password');
  }

  return res.status(200).json(formatMemberUser(membership, updatedUser));
});

export {
  fetchUser,
  createUser,
  deleteUser,
  fetchUsers,
  updateUser,
  exportUsers,
  fetchUsersLastSeen,
};
