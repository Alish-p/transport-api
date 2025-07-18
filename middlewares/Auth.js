const asyncHandler = require("express-async-handler");
const jwt = require("jsonwebtoken");
const UserModel = require("../model/User");

// check if token exists
const private = asyncHandler(async (req, res, next) => {
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
      const user = await UserModel.findById(id, { password: 0 });
      req.user = user;
      req.tenant = tenant;
      next();
    } catch (err) {
      const error = new Error("Invalid Token.");
      error.status = 404;
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

module.exports = { private, admin, checkPermission };
