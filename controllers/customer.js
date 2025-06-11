const asyncHandler = require("express-async-handler");
const Customer = require("../model/Customer");

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

  res.status(200).json(customer);
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
