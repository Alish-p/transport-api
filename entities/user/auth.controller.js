import { Resend } from 'resend';
import asyncHandler from 'express-async-handler';

import UserModel from './user.model.js';
import Tenant from '../tenant/tenant.model.js';
import { generateToken } from '../../utils/generate-token.js';
import { getOtpEmailTemplate } from '../../utils/templates/otp-template.js';

const resend = new Resend(process.env.RESEND_API_KEY);

// Auth
const loginUser = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const user = await UserModel.findOne({
    $or: [{ email }, { mobile: email }],
  });
  const matched = user ? await user.matchPassword(password) : false;

  if (user && matched) {
    res.status(200).json({
      accessToken: generateToken(user),
      user: {
        _id: user._id,
        displayName: user.displayName,
        email: user.email,
        role: user.role,
        tenant: user.tenant,
      },
    });
  } else {
    res.status(400).json({ message: "Invalid Credentials" });
  }
});

const getUser = asyncHandler(async (req, res) => {
  const tenant = await Tenant.findById(req.user.tenant);
  res.status(200).json({ user: req.user, tenant });
});

const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  const user = await UserModel.findOne({ email });

  if (!user) {
    // Return success anyway to prevent email enumeration
    return res.status(200).json({ message: "If that email exists, an OTP has been sent." });
  }

  // Rate limiting: 1 minute cooldown
  const COOLDOWN_MS = 60 * 1000;
  if (user.lastOtpSentAt && Date.now() - user.lastOtpSentAt.getTime() < COOLDOWN_MS) {
    const remainingSeconds = Math.ceil((COOLDOWN_MS - (Date.now() - user.lastOtpSentAt.getTime())) / 1000);
    return res.status(429).json({ message: `Please wait ${remainingSeconds} seconds before requesting another code.` });
  }

  let {otp} = user;
  // Check if OTP exists and is still valid
  if (!otp || !user.otpExpiresAt || user.otpExpiresAt < new Date()) {
    // Generate new 6-digit OTP
    otp = Math.floor(100000 + Math.random() * 900000).toString();
    // Set expiration to 10 minutes from now
    const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

    user.otp = otp;
    user.otpExpiresAt = otpExpiresAt;
  }

  user.lastOtpSentAt = new Date();
  await user.save();

  try {
    await resend.emails.send({
      from: 'support@tranzitsolutions.com', // Change this if you have a verified domain on Resend
      to: email,
      subject: 'Your Password Reset Code',
      html: getOtpEmailTemplate(otp),
    });
  } catch (error) {
    console.error("Failed to send OTP email via Resend:", error);
    return res.status(500).json({ message: "Failed to send OTP. Please try again later." });
  }

  res.status(200).json({ message: "If that email exists, an OTP has been sent." });
});

const resetPassword = asyncHandler(async (req, res) => {
  const { email, code, password } = req.body;

  const user = await UserModel.findOne({ email });

  if (!user || user.otp !== code || !user.otpExpiresAt || user.otpExpiresAt < new Date()) {
    return res.status(400).json({ message: "Invalid or expired OTP." });
  }

  user.password = password; // In a real app, hash the password! Assuming matchPassword handles it as is for now based on user.model.js
  user.otp = undefined;
  user.otpExpiresAt = undefined;
  await user.save();

  res.status(200).json({ message: "Password updated successfully." });
});

export { getUser, loginUser, resetPassword, forgotPassword };
