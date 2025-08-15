import asyncHandler from 'express-async-handler';
import Route from '../model/Route.js';
import Subtrip from '../model/Subtrip.js';
import { addTenantToQuery } from '../utills/tenant-utils.js';

// Create Route
const createRoute = asyncHandler(async (req, res) => {
  try {
    // Ensure transporter is null if the vehicle is owned
    if (!req.body.isCustomerSpecific) {
      req.body.customer = null;
    }
    const route = new Route({ ...req.body, tenant: req.tenant });

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

// Fetch Routes with pagination and search
const fetchRoutes = asyncHandler(async (req, res) => {
  try {
    const { routeName, fromPlace, toPlace, isCustomerSpecific, customer } =
      req.query;
    const { limit, skip } = req.pagination || {};

    const query = addTenantToQuery(req);

    if (routeName) {
      query.routeName = { $regex: routeName, $options: "i" };
    }

    if (fromPlace) {
      query.fromPlace = { $regex: fromPlace, $options: "i" };
    }

    if (toPlace) {
      query.toPlace = { $regex: toPlace, $options: "i" };
    }

    if (typeof isCustomerSpecific !== "undefined") {
      query.isCustomerSpecific =
        isCustomerSpecific === "true" ||
        isCustomerSpecific === true ||
        isCustomerSpecific === "1";
    }

    if (customer) {
      query.customer = customer;
    }

    const [routes, total, totalCustomerSpecific, totalGeneric] =
      await Promise.all([
        Route.find(query)
          .populate({
            path: "customer",
            select: "_id customerName",
            options: { lean: true },
          })
          .sort({ routeName: 1 })
          .skip(skip)
          .limit(limit),
        Route.countDocuments(query),
        Route.countDocuments({ ...query, isCustomerSpecific: true }),
        Route.countDocuments({ ...query, isCustomerSpecific: false }),
      ]);

    res.status(200).json({
      results: routes,
      total,
      totalCustomerSpecific,
      totalGeneric,
      startRange: (skip || 0) + 1,
      endRange: (skip || 0) + routes.length,
    });
  } catch (error) {
    res.status(500).json({
      message: "An error occurred while fetching routes",
      error: error.message,
    });
  }
});

// Fetch Single Route by ID
const fetchSingleRoute = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const route = await Route.findOne({ _id: id, tenant: req.tenant }).populate(
    "customer"
  );

  if (!route) {
    res.status(404).json({ message: "Route not found" });
    return;
  }

  res.status(200).json(route);
});

// Fetch Subtrips for a Route
const fetchRouteSubtrips = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const route = await Route.findOne({ _id: id, tenant: req.tenant });

  if (!route) {
    res.status(404).json({ message: "Route not found" });
    return;
  }

  const subtrips = await Subtrip.find({
    routeCd: route._id,
    tenant: req.tenant,
  })
    .populate({
      path: "tripId",
      populate: [
        {
          path: "vehicleId",
          select: "vehicleNo vehicleType noOfTyres",
        },
        {
          path: "driverId",
          select: "driverName",
        },
      ],
    })
    .populate({
      path: "customerId",
      select: "customerName",
    })
    .populate("expenses")
    .select(
      "loadingPoint unloadingPoint subtripStatus expenses startDate endDate tripId customerId"
    );

  res.status(200).json(subtrips);
});

// Update Route
const updateRoute = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;

    // Ensure customer is null if the route is generic
    if (!req.body.isCustomerSpecific) {
      req.body.customer = null;
    }

    const route = await Route.findOneAndUpdate(
      { _id: id, tenant: req.tenant },
      req.body,
      {
        new: true,
        populate: {
          path: "customer",
          select: "-__v",
          options: { lean: true },
        },
        runValidators: true,
      }
    );

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
  const route = await Route.findOneAndDelete({ _id: id, tenant: req.tenant });

  res.status(200).json(route);
});

export { createRoute,
  fetchRoutes,
  fetchSingleRoute,
  fetchRouteSubtrips,
  updateRoute,
  deleteRoute, };
