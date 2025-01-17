const asyncHandler = require("express-async-handler");
const Route = require("../model/Route");

// Create Route
const createRoute = asyncHandler(async (req, res) => {
  // Ensure transporter is null if the vehicle is owned
  if (!req.body.isCustomerSpecific) {
    req.body.customer = null;
  }
  const route = new Route({ ...req.body });

  const newRoute = await route.save();

  res.status(201).json(newRoute);
});

// Fetch Routes
const fetchRoutes = asyncHandler(async (req, res) => {
  const routes = await Route.find().populate("customer");
  res.status(200).json(routes);
});

// Fetch Customer-Specific and Generic Routes
const fetchCustomerSpecificRoutes = asyncHandler(async (req, res) => {
  const { customerId } = req.body;

  if (!customerId) {
    return res.status(400).json({ message: "Customer ID is required" });
  }

  const routes = await Route.find({
    $or: [
      { isCustomerSpecific: false }, // Fetch all generic routes
      { isCustomerSpecific: true, customer: customerId }, // Fetch routes specific to the given customer
    ],
  }).populate("customer");

  res.status(200).json(routes);
});

// Update Route
const updateRoute = asyncHandler(async (req, res) => {
  const id = req.params.id;

  // Ensure customer is null if the route is generic
  if (!req.body.isCustomerSpecific) {
    req.body.customer = null;
  }
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
  fetchCustomerSpecificRoutes,
};
