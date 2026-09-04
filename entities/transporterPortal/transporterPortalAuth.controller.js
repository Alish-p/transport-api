import jwt from 'jsonwebtoken';
import asyncHandler from 'express-async-handler';

import TransporterModel from '../transporter/transporter.model.js';
import { sendTemplateMessage } from '../../services/whatsapp.service.js';

// ----------------------------------------------------------------------
// Constants
// ----------------------------------------------------------------------

const OTP_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes
const COOLDOWN_MS = 60 * 1000;         // 1 minute
const TOKEN_EXPIRY = '24d';
const TEMP_TOKEN_EXPIRY = '5m';

// ----------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------

/**
 * Given any Indian mobile string (10-digit, 91-prefixed, or +91-prefixed),
 * returns the three canonical DB variants to search against.
 */
function getMobileVariants(mobile) {
  const digits = mobile.replace(/\D/g, '');
  const ten = digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;
  return [ten, `91${ten}`, `+91${ten}`];
}

/** Returns a fresh 6-digit OTP string. */
function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Reuses the existing OTP if still valid, otherwise generates a new one.
 * Mutates the document but does NOT save it.
 */
function ensureValidOtp(transporter) {
  const hasValidOtp =
    transporter.otp && transporter.otpExpiresAt && transporter.otpExpiresAt > new Date();
  if (!hasValidOtp) {
    transporter.otp = generateOtp();
    transporter.otpExpiresAt = new Date(Date.now() + OTP_EXPIRY_MS);
  }
  return transporter.otp;
}

/** Returns remaining cooldown seconds, or 0 if cooldown has passed. */
function getCooldownSeconds(transporter) {
  if (!transporter.lastOtpSentAt) return 0;
  const elapsed = Date.now() - transporter.lastOtpSentAt.getTime();
  return elapsed < COOLDOWN_MS ? Math.ceil((COOLDOWN_MS - elapsed) / 1000) : 0;
}

/** Generate a transporter-scoped JWT. */
function generateTransporterToken(transporter, expiresIn = TOKEN_EXPIRY) {
  const tenantId = transporter.tenant?._id
    ? transporter.tenant._id.toString()
    : transporter.tenant.toString();
  return jwt.sign(
    { id: transporter._id.toString(), tenant: tenantId, role: 'transporter' },
    process.env.JWT_SECRET,
    { expiresIn },
  );
}

// ----------------------------------------------------------------------
// Controllers
// ----------------------------------------------------------------------

/**
 * POST /api/transporter-portal/auth/request-otp
 * Accepts { mobile } — sends OTP via WhatsApp to all matching active transporters.
 */
const requestOtp = asyncHandler(async (req, res) => {
  const { mobile } = req.body;

  if (!mobile) {
    return res.status(400).json({ message: 'Mobile number is required.' });
  }

  const variants = getMobileVariants(mobile);
  const transporters = await TransporterModel.find({
    cellNo: { $in: variants },
    isActive: true,
  }).select('+otp +otpExpiresAt +lastOtpSentAt');

  if (transporters.length === 0) {
    return res.status(404).json({ message: 'No transporter found with this mobile number.' });
  }

  // Check cooldown on first transporter (same cellNo shares cooldown)
  const cooldownSeconds = getCooldownSeconds(transporters[0]);
  if (cooldownSeconds > 0) {
    return res.status(429).json({
      message: `Please wait ${cooldownSeconds} seconds before requesting another code.`,
    });
  }

  // Generate single OTP and apply to all matching transporters
  const otp = ensureValidOtp(transporters[0]);
  transporters[0].lastOtpSentAt = new Date();
  await transporters[0].save();

  // Apply same OTP to remaining transporters (if any)
  if (transporters.length > 1) {
    await TransporterModel.updateMany(
      { _id: { $in: transporters.slice(1).map((t) => t._id) } },
      {
        otp,
        otpExpiresAt: new Date(Date.now() + OTP_EXPIRY_MS),
        lastOtpSentAt: new Date(),
      },
    );
  }

  // Send OTP via WhatsApp
  const components = [
    { type: 'body', parameters: [{ type: 'text', text: otp }] },
    { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: otp }] },
  ];

  try {
    const result = await sendTemplateMessage({
      to: transporters[0].cellNo,
      templateName: 'login',
      components,
      forceGlobalFallback: true,
    });

    if (!result.ok && !result.skipped) {
      console.error('WhatsApp send error during transporter login:', result);
      return res.status(500).json({ message: 'Failed to send WhatsApp message. Please try again later.' });
    }
  } catch (error) {
    console.error('Failed to send WhatsApp message:', error);
    return res.status(500).json({ message: 'Failed to send WhatsApp message. Please try again later.' });
  }

  return res.status(200).json({ message: 'OTP sent to your WhatsApp.' });
});

/**
 * POST /api/transporter-portal/auth/verify-otp
 * Accepts { mobile, code } — verifies OTP.
 * Returns JWT directly if single transporter, or transporters list for selection.
 */
const verifyOtp = asyncHandler(async (req, res) => {
  const { mobile, code } = req.body;

  if (!mobile || !code) {
    return res.status(400).json({ message: 'Mobile number and OTP are required.' });
  }

  const variants = getMobileVariants(mobile);
  const transporters = await TransporterModel.find({
    cellNo: { $in: variants },
    isActive: true,
  })
    .select('+otp +otpExpiresAt')
    .populate('tenant', 'name contactDetails');

  // Find first transporter with matching valid OTP
  const matched = transporters.find(
    (t) => t.otp === code && t.otpExpiresAt && t.otpExpiresAt > new Date(),
  );

  if (!matched) {
    return res.status(400).json({ message: 'Invalid or expired OTP.' });
  }

  // Clear OTP fields on all matching transporters
  await TransporterModel.updateMany(
    { _id: { $in: transporters.map((t) => t._id) } },
    { $unset: { otp: '', otpExpiresAt: '', lastOtpSentAt: '' } },
  );

  // Single transporter — issue token directly
  if (transporters.length === 1) {
    const loginTime = new Date();
    await TransporterModel.findByIdAndUpdate(matched._id, { lastLoginAt: loginTime });

    const token = generateTransporterToken(matched);
    return res.status(200).json({
      token,
      transporter: {
        _id: matched._id,
        transportName: matched.transportName,
        tenant: matched.tenant,
      },
    });
  }

  // Multiple transporters — require selection
  const tempToken = generateTransporterToken(matched, TEMP_TOKEN_EXPIRY);
  return res.status(200).json({
    requiresSelection: true,
    tempToken,
    transporters: transporters.map((t) => ({
      _id: t._id,
      transportName: t.transportName,
      tenant: { _id: t.tenant._id, name: t.tenant.name },
    })),
  });
});

/**
 * POST /api/transporter-portal/auth/select-transporter
 * Accepts { transporterId } — issues a full JWT for the selected transporter.
 * Protected by temp token from verifyOtp.
 */
const selectTransporter = asyncHandler(async (req, res) => {
  const { transporterId } = req.body;

  if (!transporterId) {
    return res.status(400).json({ message: 'transporterId is required.' });
  }

  // Verify temp token from Authorization header
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer')) {
    return res.status(401).json({ message: 'Temporary token is required.' });
  }

  const tempToken = authHeader.split(' ')[1];

  let decoded;
  try {
    decoded = jwt.verify(tempToken, process.env.JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired temporary token. Please login again.' });
  }

  if (decoded.role !== 'transporter') {
    return res.status(403).json({ message: 'Invalid token type.' });
  }

  // Load the selected transporter and verify it exists
  const transporter = await TransporterModel.findById(transporterId).populate('tenant', 'name contactDetails');

  if (!transporter || !transporter.isActive) {
    return res.status(404).json({ message: 'Transporter not found or inactive.' });
  }

  const loginTime = new Date();
  await TransporterModel.findByIdAndUpdate(transporter._id, { lastLoginAt: loginTime });

  const token = generateTransporterToken(transporter);

  return res.status(200).json({
    token,
    transporter: {
      _id: transporter._id,
      transportName: transporter.transportName,
      tenant: transporter.tenant,
    },
  });
});

export { requestOtp, verifyOtp, selectTransporter };
