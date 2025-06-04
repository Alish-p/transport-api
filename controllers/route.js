const asyncHandler = require("express-async-handler");
const Route = require("../model/Route");

// Create Route
const createRoute = asyncHandler(async (req, res) => {
  try {
    // Ensure transporter is null if the vehicle is owned
    if (!req.body.isCustomerSpecific) {
      req.body.customer = null;
    }
    const route = new Route({ ...req.body });

    const newRoute = await route.save();
    res.status(201).json(newRoute);
  } catch (error) {
    if (error.message.includes("Duplicate vehicle configuration")) {
      res.status(400).json({ message: error.message });
    } else {
      res
        .status(500)
        .json({ message: "Error creating route", error: error.message });
    }
  }
});

// Fetch Routes
const fetchRoutes = asyncHandler(async (req, res) => {
  const { customerId, genericRoutes } = req.query;
  let query = {};

  if (customerId && genericRoutes === "true") {
    // Fetch both customer-specific routes and generic routes
    query = {
      $or: [
        { isCustomerSpecific: false },
        { isCustomerSpecific: true, customer: customerId },
      ],
    };
  } else if (customerId) {
    // Fetch only customer-specific routes
    query = { isCustomerSpecific: true, customer: customerId };
  } else if (genericRoutes === "true") {
    // Fetch only generic routes
    query = { isCustomerSpecific: false };
  }

  const routes = await Route.find(query).populate({
    path: "customer",
    select: "-__v", // Exclude version field
    options: { lean: true },
  });

  res.status(200).json(routes);
});

// Fetch Single Route by ID
const fetchSingleRoute = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const route = await Route.findById(id).populate("customer");

  if (!route) {
    res.status(404).json({ message: "Route not found" });
    return;
  }

  res.status(200).json(route);
});

// Update Route
const updateRoute = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;

    // Ensure customer is null if the route is generic
    if (!req.body.isCustomerSpecific) {
      req.body.customer = null;
    }

    const route = await Route.findByIdAndUpdate(id, req.body, {
      new: true,
      populate: {
        path: "customer",
        select: "-__v", // Exclude version field
        options: { lean: true },
      },
      runValidators: true, // This ensures our custom validators run on update
    });

    if (!route) {
      res.status(404).json({ message: "Route not found" });
      return;
    }

    res.status(200).json(route);
  } catch (error) {
    if (error.message.includes("Duplicate vehicle configuration")) {
      res.status(400).json({ message: error.message });
    } else {
      res
        .status(500)
        .json({ message: "Error updating route", error: error.message });
    }
  }
});

// Delete Route
const deleteRoute = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const route = await Route.findByIdAndDelete(id);

  res.status(200).json(route);
});

module.exports = {
  createRoute,
  fetchRoutes,
  fetchSingleRoute,
  updateRoute,
  deleteRoute,
};
