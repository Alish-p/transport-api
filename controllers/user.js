const asyncHandler = require("express-async-handler");
const UserModel = require("../model/User");

// Create User
const createUser = asyncHandler(async (req, res) => {
  const newUser = await new UserModel({ ...req.body }).save();
  res.status(201).json(newUser);
});

// Fetch Users
const fetchUsers = asyncHandler(async (req, res) => {
  const users = await UserModel.find();
  res.status(200).json(users);
});

// Fetch User
const fetchUser = asyncHandler(async (req, res) => {
  const user = await UserModel.findById(req.params.id);
  res.status(200).json(user);
});

// Delete User
const deleteUser = asyncHandler(async (req, res) => {
  const user = await UserModel.findByIdAndDelete(req.params.id);
  res.status(200).json(user);
});

// Update User
const updateUser = asyncHandler(async (req, res) => {
  const user = await UserModel.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
  });
  res.status(200).json(user);
});

module.exports = {
  createUser,
  fetchUsers,
  fetchUser,
  deleteUser,
  updateUser,
};
