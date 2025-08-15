import asyncHandler from 'express-async-handler';
import Tenant from '../tenant/tenant.model.js';
import { generateToken } from '../../utils/generate-token.js';
import UserModel from './user.model.js';

// Auth
const loginUser = asyncHandler(async (req, res) => {
  const user = await UserModel.findOne({ email: req.body.email });
  const matched = user ? await user.matchPassword(req.body.password) : false;

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

export { loginUser, getUser };
