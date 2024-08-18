const asyncHandler = require("express-async-handler");
const UserModel = require("../model/User");
const { generateToken } = require("../Utils/generateToken");

const registerUser = asyncHandler(async (req, res) => {
  const user = new UserModel({ ...req.body });
  const { _id, name, email, isAdmin } = await user.save();

  res.status(201).json({
    _id,
    name,
    email,
    isAdmin,
    token: generateToken(_id),
  });
});

const loginUser = asyncHandler(async (req, res) => {
  const user = await UserModel.findOne({ email: req.body.email });
  const matched = user ? await user.matchPassword(req.body.password) : false;

  if (user && matched) {
    res.status(200).json({
      accessToken: generateToken(user._id),
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } else {
    res.status(400).json({ message: "Invalid Credentials" });
  }
});

const getUser = asyncHandler(async (req, res) => {
  res.status(200).json({ user: req.user });
});

module.exports = {
  registerUser,
  loginUser,
  getUser,
};
