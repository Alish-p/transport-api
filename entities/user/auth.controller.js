import { Resend } from 'resend';
import asyncHandler from 'express-async-handler';

import UserModel from './user.model.js';
import Tenant from '../tenant/tenant.model.js';
import { generateToken } from '../../utils/generate-token.js';
import { sendTemplateMessage } from '../../services/whatsapp.service.js';
import { getOtpEmailTemplate } from '../../utils/templates/otp-template.js';
import TenantMembership from '../tenantMembership/tenantMembership.model.js';

const resend = new Resend(process.env.RESEND_API_KEY);

const OTP_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes
const COOLDOWN_MS = 60 * 1000;        // 1 minute

// ----------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------

/**
 * Given any Indian mobile string (10-digit, 91-prefixed, or +91-prefixed),
 * returns the three canonical DB variants to search against.
 * Frontend always sends "91XXXXXXXXXX" so cleanDigits will be 12 chars.
 */
function getMobileVariants(mobile) {
  const digits = mobile.replace(/\D/g, '');
  const ten = digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;
  return [ten, `91${ten}`, `+91${ten}`];
}

/** Returns a fresh 6-digit OTP string */
function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Reuses the existing OTP if still valid, otherwise generates a new one.
 * Mutates the user document but does NOT save it.
 */
function ensureValidOtp(user) {
  const hasValidOtp = user.otp && user.otpExpiresAt && user.otpExpiresAt > new Date();
  if (!hasValidOtp) {
    user.otp = generateOtp();
    user.otpExpiresAt = new Date(Date.now() + OTP_EXPIRY_MS);
  }
  return user.otp;
}

/** Returns remaining cooldown seconds, or 0 if cooldown has passed. */
function getCooldownSeconds(user) {
  if (!user.lastOtpSentAt) return 0;
  const elapsed = Date.now() - user.lastOtpSentAt.getTime();
  return elapsed < COOLDOWN_MS ? Math.ceil((COOLDOWN_MS - elapsed) / 1000) : 0;
}

/**
 * Resolves accessible tenants and active membership for a user
 */
async function resolveUserTenantsAndActive(user, requestedTenantId = null) {
  const memberships = await TenantMembership.find({
    user: user._id,
    status: 'active',
  }).populate({
    path: 'tenant',
    select: 'name slug logoUrl logoKey theme subscription isActive config integrations address contactDetails',
  });

  let accessibleTenants = [];
  let activeMembership = null;
  let activeTenant = null;

  if (memberships.length > 0) {
    accessibleTenants = memberships
      .filter((m) => m.tenant && m.tenant.isActive !== false)
      .map((m) => ({
        _id: m.tenant._id,
        name: m.tenant.name,
        slug: m.tenant.slug,
        logoUrl: m.tenant.logoUrl,
        logoKey: m.tenant.logoKey,
        theme: m.tenant.theme,
        role: m.role,
        designation: m.designation,
        isDefault: m.isDefault,
      }));

    if (requestedTenantId) {
      activeMembership = memberships.find(
        (m) => m.tenant && m.tenant._id.toString() === requestedTenantId.toString()
      );
    }

    if (!activeMembership && user.lastActiveTenant) {
      activeMembership = memberships.find(
        (m) => m.tenant && m.tenant._id.toString() === user.lastActiveTenant.toString()
      );
    }

    if (!activeMembership) {
      activeMembership = memberships.find((m) => m.isDefault) || memberships[0];
    }

    if (activeMembership && activeMembership.tenant) {
      activeTenant = activeMembership.tenant;
    }
  }

  // Superusers may access a tenant directly without an explicit membership document
  if (!activeTenant && user.role === 'super') {
    const targetId = requestedTenantId || user.lastActiveTenant;
    if (targetId) {
      activeTenant = await Tenant.findById(targetId);
    }
  }

  return {
    accessibleTenants,
    activeMembership,
    activeTenant,
  };
}

// ----------------------------------------------------------------------
// Controllers
// ----------------------------------------------------------------------

const loginUser = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const user = await UserModel.findOne({ $or: [{ email }, { mobile: email }] });
  const matched = user ? await user.matchPassword(password) : false;

  if (user && matched) {
    const { accessibleTenants, activeMembership, activeTenant } = await resolveUserTenantsAndActive(user);

    if (!activeTenant && user.role !== 'super') {
      return res.status(403).json({ message: 'User does not have an active membership in any company' });
    }

    const activeTenantId = activeTenant?._id || null;

    if (activeTenantId && (!user.lastActiveTenant || user.lastActiveTenant.toString() !== activeTenantId.toString())) {
      user.lastActiveTenant = activeTenantId;
      await user.save();
    }

    return res.status(200).json({
      accessToken: generateToken(user, activeTenantId),
      user: {
        _id: user._id,
        name: user.name,
        displayName: user.displayName || user.name,
        email: user.email,
        mobile: user.mobile,
        role: activeMembership?.role || user.role,
        designation: activeMembership?.designation || user.designation || '',
        permissions: activeMembership?.permissions || {},
        tenant: activeTenantId,
      },
      tenant: activeTenant,
      accessibleTenants,
    });
  }

  return res.status(400).json({ message: 'Invalid Credentials' });
});

const getUser = asyncHandler(async (req, res) => {
  const { accessibleTenants } = await resolveUserTenantsAndActive(req.user, req.tenant);
  const tenant = await Tenant.findById(req.tenant);
  res.status(200).json({ user: req.user, tenant, accessibleTenants });
});

const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  const user = await UserModel.findOne({ email });

  // Generic response to prevent email enumeration
  if (!user) {
    return res.status(200).json({ message: 'If that email exists, an OTP has been sent.' });
  }

  const cooldownSeconds = getCooldownSeconds(user);
  if (cooldownSeconds > 0) {
    return res.status(429).json({ message: `Please wait ${cooldownSeconds} seconds before requesting another code.` });
  }

  const otp = ensureValidOtp(user);
  user.lastOtpSentAt = new Date();
  await user.save();

  try {
    await resend.emails.send({
      from: 'support@tranzitsolutions.com',
      to: email,
      subject: 'Your Password Reset Code',
      html: getOtpEmailTemplate(otp),
    });
  } catch (error) {
    console.error('Failed to send OTP email via Resend:', error);
    return res.status(500).json({ message: 'Failed to send OTP. Please try again later.' });
  }

  return res.status(200).json({ message: 'If that email exists, an OTP has been sent.' });
});

const resetPassword = asyncHandler(async (req, res) => {
  const { email, code, password } = req.body;
  const user = await UserModel.findOne({ email });

  if (!user || user.otp !== code || !user.otpExpiresAt || user.otpExpiresAt < new Date()) {
    return res.status(400).json({ message: 'Invalid or expired OTP.' });
  }

  user.password = password;
  user.otp = undefined;
  user.otpExpiresAt = undefined;
  await user.save();

  return res.status(200).json({ message: 'Password updated successfully.' });
});

const requestWhatsAppOTP = asyncHandler(async (req, res) => {
  const { mobile } = req.body;

  if (!mobile) {
    return res.status(400).json({ message: 'Mobile number is required.' });
  }

  // Frontend always sends "91XXXXXXXXXX"; search all 3 canonical formats
  const user = await UserModel.findOne({ mobile: { $in: getMobileVariants(mobile) } });

  // Generic response to prevent mobile number enumeration
  if (!user) {
    return res.status(200).json({ message: 'If that mobile number is registered, a code has been sent.' });
  }

  const cooldownSeconds = getCooldownSeconds(user);
  if (cooldownSeconds > 0) {
    return res.status(429).json({ message: `Please wait ${cooldownSeconds} seconds before requesting another code.` });
  }

  const otp = ensureValidOtp(user);
  user.lastOtpSentAt = new Date();
  await user.save();

  const components = [
    { type: 'body', parameters: [{ type: 'text', text: otp }] },
    { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: otp }] },
  ];

  try {
    const result = await sendTemplateMessage({
      to: user.mobile,
      templateName: 'login',
      components,
      forceGlobalFallback: true,
    });

    if (!result.ok && !result.skipped) {
      console.error('WhatsApp send error during login:', result);
      return res.status(500).json({ message: 'Failed to send WhatsApp message. Please try again later.' });
    }
  } catch (error) {
    console.error('Failed to send WhatsApp message:', error);
    return res.status(500).json({ message: 'Failed to send WhatsApp message. Please try again later.' });
  }

  return res.status(200).json({ message: 'If that mobile number is registered, a code has been sent.' });
});

const verifyWhatsAppOTP = asyncHandler(async (req, res) => {
  const { mobile, code } = req.body;

  if (!mobile || !code) {
    return res.status(400).json({ message: 'Mobile number and verification code are required.' });
  }

  const user = await UserModel.findOne({ mobile: { $in: getMobileVariants(mobile) } });

  if (!user || user.otp !== code || !user.otpExpiresAt || user.otpExpiresAt < new Date()) {
    return res.status(400).json({ message: 'Invalid or expired verification code.' });
  }

  user.otp = undefined;
  user.otpExpiresAt = undefined;
  await user.save();

  const { accessibleTenants, activeMembership, activeTenant } = await resolveUserTenantsAndActive(user);

  if (!activeTenant && user.role !== 'super') {
    return res.status(403).json({ message: 'User does not have an active membership in any company' });
  }

  const activeTenantId = activeTenant?._id || null;

  if (activeTenantId && (!user.lastActiveTenant || user.lastActiveTenant.toString() !== activeTenantId.toString())) {
    user.lastActiveTenant = activeTenantId;
    await user.save();
  }

  return res.status(200).json({
    accessToken: generateToken(user, activeTenantId),
    user: {
      _id: user._id,
      name: user.name,
      displayName: user.displayName || user.name,
      email: user.email,
      mobile: user.mobile,
      role: activeMembership?.role || user.role,
      designation: activeMembership?.designation || user.designation || '',
      permissions: activeMembership?.permissions || {},
      tenant: activeTenantId,
    },
    tenant: activeTenant,
    accessibleTenants,
  });
});

const switchTenant = asyncHandler(async (req, res) => {
  const { tenantId } = req.body;
  if (!tenantId) {
    return res.status(400).json({ message: 'Target tenantId is required' });
  }

  const userId = req.user._id;

  // 1. Verify user has an active membership in the target tenant (or is superuser)
  const membership = await TenantMembership.findOne({
    user: userId,
    tenant: tenantId,
    status: 'active',
  }).populate({
    path: 'tenant',
    select: 'name slug logoUrl logoKey theme subscription isActive config integrations address contactDetails',
  });

  let targetTenant = membership ? membership.tenant : null;

  if (!targetTenant && req.user.role === 'super') {
    targetTenant = await Tenant.findById(tenantId);
  }

  if (!targetTenant || targetTenant.isActive === false) {
    return res.status(403).json({ message: 'You do not have access to this company or company is inactive' });
  }

  // 2. Update user's lastActiveTenant
  await UserModel.updateOne({ _id: userId }, { lastActiveTenant: targetTenant._id });

  // 3. Issue fresh tenant-scoped token
  const newAccessToken = generateToken(req.user, targetTenant._id);

  // 4. Resolve updated accessible tenants list
  const { accessibleTenants } = await resolveUserTenantsAndActive(req.user, targetTenant._id);

  return res.status(200).json({
    accessToken: newAccessToken,
    tenant: targetTenant,
    user: {
      _id: req.user._id,
      name: req.user.name,
      displayName: req.user.displayName || req.user.name,
      email: req.user.email,
      mobile: req.user.mobile,
      role: membership?.role || req.user.role,
      designation: membership?.designation || req.user.designation || '',
      permissions: membership?.permissions || req.user.permissions || {},
      tenant: targetTenant._id,
    },
    accessibleTenants,
  });
});

export {
  getUser,
  loginUser,
  switchTenant,
  resetPassword,
  forgotPassword,
  verifyWhatsAppOTP,
  requestWhatsAppOTP,
};
