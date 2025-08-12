const asyncHandler = require("express-async-handler");
const UserModel = require("../model/User");

// Create User
const createUser = asyncHandler(async (req, res) => {
  const newUser = await new UserModel({
    ...req.body,
    tenant: req.tenant,
  }).save();
  res.status(201).json(newUser);
});

// Fetch Users
const fetchUsers = asyncHandler(async (req, res) => {
  const users = await UserModel.find({ tenant: req.tenant }).sort({ name: 1 });
  res.status(200).json(users);
});

// Fetch Users Last Seen
const fetchUsersLastSeen = asyncHandler(async (req, res) => {
  const users = await UserModel.find({ tenant: req.tenant })
    .select("name lastSeen")
    .sort({ name: 1 });
  res.status(200).json(users);
});

// Fetch User
const fetchUser = asyncHandler(async (req, res) => {
  const user = await UserModel.findOne({
    _id: req.params.id,
    tenant: req.tenant,
  });
  res.status(200).json(user);
});

// Delete User
const deleteUser = asyncHandler(async (req, res) => {
  const user = await UserModel.findOneAndDelete({
    _id: req.params.id,
    tenant: req.tenant,
  });
  res.status(200).json(user);
});

// Update User
const updateUser = asyncHandler(async (req, res) => {
  const user = await UserModel.findOneAndUpdate(
    { _id: req.params.id, tenant: req.tenant },
    req.body,
    { new: true }
  );
  res.status(200).json(user);
});

module.exports = {
  createUser,
  fetchUsers,
  fetchUsersLastSeen,
  fetchUser,
  deleteUser,
  updateUser,
};
