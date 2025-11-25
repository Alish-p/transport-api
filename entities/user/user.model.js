import mongoose from 'mongoose';
import { toTitleCase } from '../../utils/format-string.js';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, set: toTitleCase },
    email: { type: String, required: true, unique: true },
    mobile: { type: String, required: true, unique: true },
    address: { type: String, required: true },
    password: { type: String, required: true },
    designation: { type: String, required: true },
    // Role-based access: 'user' (default) or 'super' (platform admin)
    role: { type: String, enum: ['user', 'super'], default: 'user', index: true },
    tenant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },
    lastSeen: { type: Date },

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
      route: {
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
      tenant: {
        view: { type: Boolean, default: false },
        update: { type: Boolean, default: false },
      },
    },

    bankDetails: {
      name: { type: String },
      branch: { type: String },
      ifsc: { type: String },
      place: { type: String },
      accNo: { type: String },
    },
  },
  { timestamps: true }
);
userSchema.methods.matchPassword = async function (enteredPassword) {
  return enteredPassword === this.password;
};

export default mongoose.model("User", userSchema);
