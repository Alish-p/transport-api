import asyncHandler from 'express-async-handler';
import UserModel from '../user/user.model.js';
import Tenant from '../tenant/tenant.model.js';
import Driver from '../driver/driver.model.js';
import Customer from '../customer/customer.model.js';
import Subtrip from '../subtrip/subtrip.model.js';
import Transporter from '../transporter/transporter.model.js';
import TransporterPayment from '../transporterPayment/transporterPayment.model.js';
import Invoice from '../invoice/invoice.model.js';
import Option from '../option/option.model.js';
import { DEFAULT_TENANT_OPTIONS } from '../option/option.defaults.js';

// Build a permissions object with every boolean permission set to true
function buildFullPermissionsFromSchema() {
  const def = UserModel.schema?.obj?.permissions || {};
  const traverse = (node) => {
    const out = {};
    for (const [k, v] of Object.entries(node)) {
      // Leaf boolean definition: { type: Boolean, default: false }
      if (v && typeof v === 'object' && 'type' in v && v.type === Boolean) {
        out[k] = true;
      } else if (v && typeof v === 'object' && !Array.isArray(v)) {
        out[k] = traverse(v);
      }
    }
    return out;
  };
  return traverse(def);
}

// Superuser: create a user under a specific tenant with all permissions enabled
const createUserForTenant = asyncHandler(async (req, res) => {
  const { tenantId } = req.params;
  const body = { ...req.body };

  // Do not allow setting role here; this route is for creating
  // a fully-permissioned tenant user, not for promoting to super.
  delete body.role;

  const permissions = buildFullPermissionsFromSchema();

  const user = await new UserModel({
    ...body,
    tenant: tenantId,
    permissions,
  }).save();

  return res.status(201).json(user);
});



// Create Tenant
const createTenant = asyncHandler(async (req, res) => {
  const tenant = new Tenant({ ...req.body });
  const newTenant = await tenant.save();

  // Seed default options
  try {
    const optionDocs = [];
    for (const groupDef of DEFAULT_TENANT_OPTIONS) {
      const { group, options } = groupDef;
      for (const opt of options) {
        optionDocs.push({
          tenant: newTenant._id,
          group,
          label: opt,
          value: opt,
          isFixed: false,
        });
      }
    }
    if (optionDocs.length > 0) {
      await Option.insertMany(optionDocs);
    }
  } catch (error) {
    console.error('Error seeding default options:', error);
    // We don't fail the tenant creation if seeding fails, but we log it.
  }

  res.status(201).json(newTenant);
});

// Fetch Tenants with pagination and search
const fetchTenants = asyncHandler(async (req, res) => {
  try {
    const { search } = req.query;
    const { limit, skip } = req.pagination || { limit: 20, skip: 0 };

    const query = {};
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { slug: { $regex: search, $options: 'i' } },
      ];
    }

    const [tenants, total] = await Promise.all([
      Tenant.find(query).sort({ name: 1 }).skip(skip).limit(limit),
      Tenant.countDocuments(query),
    ]);

    res.status(200).json({
      tenants,
      total,
      startRange: skip + 1,
      endRange: skip + tenants.length,
    });
  } catch (error) {
    res.status(500).json({
      message: 'An error occurred while fetching paginated tenants',
      error: error.message,
    });
  }
});

// Delete Tenant
const deleteTenant = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const tenant = await Tenant.findByIdAndDelete(id);
  res.status(200).json(tenant);
});

// Add a payment record to a tenant
const addTenantPayment = asyncHandler(async (req, res) => {
  const { id } = req.params; // tenant id
  const { amount, paymentDate, paymentMethod, status, notes } = req.body || {};

  if (typeof amount !== 'number' || Number.isNaN(amount) || amount < 0) {
    return res.status(400).json({ message: 'amount must be a non-negative number' });
  }
  if (!paymentDate) {
    return res.status(400).json({ message: 'paymentDate is required' });
  }
  const methods = ['UPI', 'Card', 'BankTransfer', 'Cash'];
  if (!methods.includes(String(paymentMethod))) {
    return res.status(400).json({ message: 'paymentMethod must be one of UPI|Card|BankTransfer|Cash' });
  }
  const statuses = ['SUCCESS', 'FAILED', 'PENDING'];
  if (status && !statuses.includes(String(status))) {
    return res.status(400).json({ message: 'status must be one of SUCCESS|FAILED|PENDING' });
  }

  const update = {
    $push: {
      paymentHistory: {
        amount,
        paymentDate: new Date(paymentDate),
        paymentMethod,
        status: status || 'PENDING',
        ...(notes ? { notes } : {}),
      },
    },
  };

  const tenant = await Tenant.findByIdAndUpdate(id, update, { new: true });
  if (!tenant) return res.status(404).json({ message: 'Tenant not found' });
  return res.status(200).json(tenant);
});

// Update a specific payment record
const updateTenantPayment = asyncHandler(async (req, res) => {
  const { id, paymentId } = req.params; // tenant id, payment subdoc id
  const payload = {};
  const { amount, paymentDate, paymentMethod, status, notes } = req.body || {};

  if (amount !== undefined) {
    if (typeof amount !== 'number' || Number.isNaN(amount) || amount < 0) {
      return res.status(400).json({ message: 'amount must be a non-negative number' });
    }
    payload['paymentHistory.$[p].amount'] = amount;
  }
  if (paymentDate !== undefined) {
    const d = new Date(paymentDate);
    if (isNaN(d.getTime())) return res.status(400).json({ message: 'paymentDate must be a valid date' });
    payload['paymentHistory.$[p].paymentDate'] = d;
  }
  if (paymentMethod !== undefined) {
    const methods = ['UPI', 'Card', 'BankTransfer', 'Cash'];
    if (!methods.includes(String(paymentMethod))) {
      return res.status(400).json({ message: 'paymentMethod must be one of UPI|Card|BankTransfer|Cash' });
    }
    payload['paymentHistory.$[p].paymentMethod'] = paymentMethod;
  }
  if (status !== undefined) {
    const statuses = ['SUCCESS', 'FAILED', 'PENDING'];
    if (!statuses.includes(String(status))) {
      return res.status(400).json({ message: 'status must be one of SUCCESS|FAILED|PENDING' });
    }
    payload['paymentHistory.$[p].status'] = status;
  }
  if (notes !== undefined) {
    payload['paymentHistory.$[p].notes'] = notes;
  }

  if (Object.keys(payload).length === 0) {
    return res.status(400).json({ message: 'No valid fields to update' });
  }

  const tenant = await Tenant.findOneAndUpdate(
    { _id: id, 'paymentHistory._id': paymentId },
    { $set: payload },
    { new: true, arrayFilters: [{ 'p._id': paymentId }] }
  );

  if (!tenant) return res.status(404).json({ message: 'Tenant or payment record not found' });
  return res.status(200).json(tenant);
});

// Delete a specific payment record
const deleteTenantPayment = asyncHandler(async (req, res) => {
  const { id, paymentId } = req.params; // tenant id, payment subdoc id

  const tenant = await Tenant.findByIdAndUpdate(
    id,
    { $pull: { paymentHistory: { _id: paymentId } } },
    { new: true }
  );

  if (!tenant) return res.status(404).json({ message: 'Tenant not found' });
  return res.status(200).json(tenant);
});

// Fetch any tenant by id (superuser) with users and summary stats
const fetchTenantDetails = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const tenant = await Tenant.findById(id);
  if (!tenant) return res.status(404).json({ message: 'Tenant not found' });

  const [users, driverCount, customerCount, subtripCount, transporterCount, tpCount, invoiceAgg] = await Promise.all([
    UserModel.find({ tenant: id }, { password: 0 }).sort({ name: 1 }),
    Driver.countDocuments({ tenant: id }),
    Customer.countDocuments({ tenant: id }),
    Subtrip.countDocuments({ tenant: id }),
    Transporter.countDocuments({ tenant: id }),
    TransporterPayment.countDocuments({ tenant: id }),
    Invoice.aggregate([
      { $match: { tenant: tenant._id } },
      { $group: { _id: null, total: { $sum: '$netTotal' } } },
    ]),
  ]);

  const totalInvoiceGenerated = Array.isArray(invoiceAgg) && invoiceAgg.length > 0 ? invoiceAgg[0].total || 0 : 0;

  return res.status(200).json({
    tenant,
    users,
    stats: {
      counts: {
        drivers: driverCount,
        customers: customerCount,
        users: users.length,
        subtrips: subtripCount,
        transporters: transporterCount,
        transporterPayments: tpCount,
      },
      totals: {
        invoiceGenerated: totalInvoiceGenerated,
      },
      subscription: tenant.subscription || null,
    },
  });
});

export {
  createTenant,
  fetchTenants,
  deleteTenant,
  addTenantPayment, createUserForTenant,
  updateTenantPayment,
  deleteTenantPayment,
  fetchTenantDetails,
};
