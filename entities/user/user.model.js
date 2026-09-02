import mongoose from 'mongoose';

import { toTitleCase } from '../../utils/format-string.js';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, set: toTitleCase },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    mobile: { type: String, required: true, unique: true, trim: true },
    address: { type: String, required: true },
    password: { type: String, required: true },
    designation: { type: String, required: false },
    // Platform-level access: 'user' (default) or 'super' (platform admin)
    role: { type: String, enum: ['user', 'super'], default: 'user', index: true },
    // The active company the user last worked in
    lastActiveTenant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      index: true,
    },
    lastSeen: { type: Date },
    otp: { type: String },
    otpExpiresAt: { type: Date },
    lastOtpSentAt: { type: Date },

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

export default mongoose.model('User', userSchema);
