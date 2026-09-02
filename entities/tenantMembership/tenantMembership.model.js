import mongoose from 'mongoose';

const tenantMembershipSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    tenant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true,
    },
    role: {
      type: String,
      enum: ['owner', 'admin', 'manager', 'dispatcher', 'accountant', 'viewer', 'custom', 'user'],
      default: 'custom',
    },
    designation: {
      type: String,
      trim: true,
      default: '',
    },
    status: {
      type: String,
      enum: ['active', 'suspended', 'inactive'],
      default: 'active',
      index: true,
    },
    isDefault: {
      type: Boolean,
      default: false,
    },

    permissions: {
      customer: {
        create: { type: Boolean, default: false },
        view: { type: Boolean, default: false },
        update: { type: Boolean, default: false },
        delete: { type: Boolean, default: false },
      },
      driver: {
        create: { type: Boolean, default: false },
        view: { type: Boolean, default: false },
        update: { type: Boolean, default: false },
        delete: { type: Boolean, default: false },
      },
      driverSalary: {
        create: { type: Boolean, default: false },
        view: { type: Boolean, default: false },
        update: { type: Boolean, default: false },
        delete: { type: Boolean, default: false },
      },
      expense: {
        create: { type: Boolean, default: false },
        view: { type: Boolean, default: false },
        update: { type: Boolean, default: false },
        delete: { type: Boolean, default: false },
      },
      invoice: {
        create: { type: Boolean, default: false },
        view: { type: Boolean, default: false },
        update: { type: Boolean, default: false },
        delete: { type: Boolean, default: false },
      },
      loan: {
        create: { type: Boolean, default: false },
        view: { type: Boolean, default: false },
        update: { type: Boolean, default: false },
        delete: { type: Boolean, default: false },
      },
      pump: {
        create: { type: Boolean, default: false },
        view: { type: Boolean, default: false },
        update: { type: Boolean, default: false },
        delete: { type: Boolean, default: false },
      },
      part: {
        create: { type: Boolean, default: false },
        view: { type: Boolean, default: false },
        update: { type: Boolean, default: false },
        delete: { type: Boolean, default: false },
      },
      partLocation: {
        create: { type: Boolean, default: false },
        view: { type: Boolean, default: false },
        update: { type: Boolean, default: false },
        delete: { type: Boolean, default: false },
      },
      vendor: {
        create: { type: Boolean, default: false },
        view: { type: Boolean, default: false },
        update: { type: Boolean, default: false },
        delete: { type: Boolean, default: false },
      },
      purchaseOrder: {
        create: { type: Boolean, default: false },
        view: { type: Boolean, default: false },
        update: { type: Boolean, default: false },
        delete: { type: Boolean, default: false },
        approve: { type: Boolean, default: false },
      },
      workOrder: {
        create: { type: Boolean, default: false },
        view: { type: Boolean, default: false },
        update: { type: Boolean, default: false },
        delete: { type: Boolean, default: false },
      },
      subtrip: {
        create: { type: Boolean, default: false },
        view: { type: Boolean, default: false },
        update: { type: Boolean, default: false },
        delete: { type: Boolean, default: false },
      },
      transporter: {
        create: { type: Boolean, default: false },
        view: { type: Boolean, default: false },
        update: { type: Boolean, default: false },
        delete: { type: Boolean, default: false },
      },
      transporterPayment: {
        create: { type: Boolean, default: false },
        view: { type: Boolean, default: false },
        update: { type: Boolean, default: false },
        delete: { type: Boolean, default: false },
      },
      trip: {
        create: { type: Boolean, default: false },
        view: { type: Boolean, default: false },
        update: { type: Boolean, default: false },
        delete: { type: Boolean, default: false },
      },
      user: {
        create: { type: Boolean, default: false },
        view: { type: Boolean, default: false },
        update: { type: Boolean, default: false },
        delete: { type: Boolean, default: false },
      },
      vehicle: {
        create: { type: Boolean, default: false },
        view: { type: Boolean, default: false },
        update: { type: Boolean, default: false },
        delete: { type: Boolean, default: false },
      },
      tenant: {
        view: { type: Boolean, default: false },
        update: { type: Boolean, default: false },
      },
      tyre: {
        create: { type: Boolean, default: false },
        view: { type: Boolean, default: false },
        update: { type: Boolean, default: false },
        delete: { type: Boolean, default: false },
      },
    },
  },
  { timestamps: true }
);

// Prevent duplicate membership for the same user in the same company
tenantMembershipSchema.index({ user: 1, tenant: 1 }, { unique: true });

export default mongoose.model('TenantMembership', tenantMembershipSchema);
