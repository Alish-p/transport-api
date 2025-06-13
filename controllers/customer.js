const asyncHandler = require("express-async-handler");
const Customer = require("../model/Customer");
const Invoice = require("../model/Invoice");
const Subtrip = require("../model/Subtrip");
const mongoose = require("mongoose");

// Create Customer
const createCustomer = asyncHandler(async (req, res) => {
  const newCustomer = new Customer({
    ...req.body,
  });
  const savedCustomer = await newCustomer.save();
  res.status(201).json(savedCustomer);
});

// Fetch All Customers
const fetchCustomers = asyncHandler(async (req, res) => {
  const customers = await Customer.find();
  res.status(200).json(customers);
});

// Fetch Light Customers (only name, state, cellNo)
const fetchCustomersSummary = asyncHandler(async (req, res) => {
  const customers = await Customer.find().select(
    "customerName state cellNo address gstEnabled"
  );
  res.status(200).json(customers);
});

// Fetch Single Customer
const fetchCustomer = asyncHandler(async (req, res) => {
  const customer = await Customer.findById(req.params.id);

  if (!customer) {
    res.status(404).json({ message: "Customer not found" });
    return;
  }

  const invoices = await Invoice.find({ customerId: req.params.id }).select(
    "_id invoiceNo issueDate dueDate netTotal"
  );

  const currentYear = new Date().getUTCFullYear();
  const marchStart = new Date(Date.UTC(currentYear, 2, 1));
  const aprilStart = new Date(Date.UTC(currentYear, 3, 1));

  const analytics = await Subtrip.aggregate([
    {
      $match: {
        customerId: new mongoose.Types.ObjectId(req.params.id),
        startDate: { $gte: marchStart, $lt: aprilStart },
        isEmpty: false,
      },
    },
    {
      $group: {
        _id: "$materialType",
        loadingWeightMoved: { $sum: { $ifNull: ["$loadingWeight", 0] } },
        freightAmount: {
          $sum: {
            $multiply: [
              { $ifNull: ["$loadingWeight", 0] },
              { $ifNull: ["$rate", 0] },
            ],
          },
        },
      },
    },
    {
      $project: {
        _id: 0,
        materialType: "$_id",
        loadingWeightMoved: 1,
        freightAmount: 1,
      },
    },
  ]);

  res.status(200).json({
    ...customer.toObject(),
    invoices,
    analytics,
  });
});

// Update Customer
const updateCustomer = asyncHandler(async (req, res) => {
  const updatedCustomer = await Customer.findByIdAndUpdate(
    req.params.id,
    req.body,
    {
      new: true,
    }
  );
  res.status(200).json(updatedCustomer);
});

// Delete Customer
const deleteCustomer = asyncHandler(async (req, res) => {
  const customer = await Customer.findById(req.params.id);

  if (!customer) {
    res.status(404).json({ message: "Customer not found" });
    return;
  }

  await Customer.findByIdAndDelete(req.params.id);
  res.status(200).json({ message: "Customer deleted successfully" });
});

module.exports = {
  createCustomer,
  fetchCustomers,
  fetchCustomersSummary,
  fetchCustomer,
  updateCustomer,
  deleteCustomer,
};
