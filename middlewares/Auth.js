const UserModel = require('../model/User');
const asyncHandler = require('express-async-handler');
const jwt = require('jsonwebtoken');

// check if token exists
const private = asyncHandler(async (req, res, next) => {
  let token = req.headers.authorization;

  if (token && token.startsWith('Bearer')) {
    token = token.split(' ')[1];
    try {
      const { id } = jwt.verify(token, process.env.JWT_SECRET);
      const user = await UserModel.findById(id, { password: 0 });
      req.user = user;
      next();
    } catch (err) {
      const error = new Error('Invalid Token.');
      error.status = 404;
      next(error);
    }
  } else {
    res.status(401).json({ message: 'Not Authorized! Please login ' });
  }
});

const admin = (req, res, next) => {
  if (req.user && req.user.isAdmin) {
    next();
  } else {
    const err = new Error('Not authorized as an admin');
    err.status = 401;
    next(err);
  }
};

module.exports = { private, admin };
