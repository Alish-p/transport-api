const asyncHandler = require("express-async-handler");
const UserModel = require("../model/User");
const { generateToken } = require("../Utils/generateToken");

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
  res.status(200).json({ user: req.user });
});

module.exports = { loginUser, getUser };
