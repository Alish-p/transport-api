import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import asyncHandler from 'express-async-handler';

import UserModel from '../entities/user/user.model.js';
import TenantMembership from '../entities/tenantMembership/tenantMembership.model.js';

// check if token exists and resolve active tenant membership
const authenticate = asyncHandler(async (req, res, next) => {
  let token = req.headers.authorization;

  if (token && token.startsWith("Bearer")) {
    token = token.split(" ")[1];
    try {
      const { id, tenant } = jwt.verify(token, process.env.JWT_SECRET);
      if (!tenant) {
        const error = new Error("Tenant missing in token");
        error.status = 400;
        return next(error);
      }

      const userDoc = await UserModel.findById(id, { password: 0 });
      if (!userDoc) {
        const error = new Error("User not found");
        error.status = 401;
        return next(error);
      }

      const activeTenantId = new mongoose.Types.ObjectId(tenant);

      // Superusers have platform-wide access
      if (userDoc.role === 'super') {
        req.user = userDoc.toObject ? userDoc.toObject() : { ...userDoc };
        req.tenant = activeTenantId;
      } else {
        // Find active company membership
        const membership = await TenantMembership.findOne({
          user: id,
          tenant: activeTenantId,
          status: 'active',
        });

        if (!membership) {
          return res.status(403).json({ message: "Access denied: Not an active member of this company" });
        }

        req.membership = membership;
        req.tenant = activeTenantId;
        const userObj = userDoc.toObject ? userDoc.toObject() : { ...userDoc };
        userObj.permissions = membership.permissions;
        userObj.role = membership.role;
        userObj.designation = membership.designation;
        req.user = userObj;
      }

      // ✅ Update last seen in background (non-blocking)
      setImmediate(() => {
        UserModel.updateOne({ _id: id }, { lastSeen: new Date() }).catch(
          (error) => {
            console.error("Failed to update lastSeen", error);
          },
        );
      });
      next();
    } catch (err) {
      const error = new Error("Invalid Token.");
      error.status = 401;
      next(error);
    }
  } else {
    res.status(401).json({ message: "Not Authorized! Please login " });
  }
});

const admin = (req, res, next) => {
  if (req.user && req.user.isAdmin) {
    next();
  } else {
    const err = new Error("Not authorized as an admin");
    err.status = 401;
    next(err);
  }
};

function checkPermission(resource, action) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const userPermissions = req.user.permissions;

    if (!userPermissions[resource] || !userPermissions[resource][action]) {
      return res.status(403).json({
        message: `Forbidden: you do not have permission to ${action} ${resource}`,
      });
    }

    next();
  };
}

// Superuser-only guard
const requireSuperuser = (req, res, next) => {
  if (req.user && (req.user.role === 'super' || req.user.isSuperAdmin === true)) {
    return next();
  }
  const err = new Error('Not authorized: superuser only');
  err.status = 403;
  return next(err);
};
export { admin, authenticate, checkPermission, requireSuperuser };
