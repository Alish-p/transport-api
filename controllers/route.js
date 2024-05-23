const asyncHandler = require("express-async-handler");
const Route = require("../model/Route");

// Create Route
const createRoute = asyncHandler(async (req, res) => {
  const route = new Route({ ...req.body });
  const newRoute = await route.save();

  res.status(201).json(newRoute);
});

// Fetch Routes
const fetchRoutes = asyncHandler(async (req, res) => {
  const routes = await Route.find();
  res.status(200).json(routes);
});

// Update Route
const updateRoute = asyncHandler(async (req, res) => {
  const id = req.params.id;
  const route = await Route.findByIdAndUpdate(id, req.body, { new: true });

  res.status(200).json(route);
});

// Delete Route
const deleteRoute = asyncHandler(async (req, res) => {
  const id = req.params.id;
  const route = await Route.findByIdAndDelete(id);

  res.status(200).json(route);
});

module.exports = {
  createRoute,
  fetchRoutes,
  updateRoute,
  deleteRoute,
};
