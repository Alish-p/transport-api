const asyncHandler = require("express-async-handler");
const Invoice = require("../model/Invoice");
const Subtrip = require("../model/Subtrip");

const createInvoice = asyncHandler(async (req, res) => {
  const { subtrips } = req.body;

  // Create a new invoice
  const newInvoice = new Invoice({
    ...req.body,
    invoiceStatus: "pending",
    createdDate: new Date(),
  });

  // Save the new invoice
  const savedInvoice = await newInvoice.save();

  // Update the status of the subtrips to "billed"
  await Subtrip.updateMany(
    { _id: { $in: subtrips }, subtripStatus: "closed" },
    { $set: { subtripStatus: "billed" } }
  );

  res.status(201).json(savedInvoice);
});

// Fetch All Invoices
const fetchInvoices = asyncHandler(async (req, res) => {
  const invoices = await Invoice.find()
    .populate("customerId")
    .populate("subtrips");
  res.status(200).json(invoices);
});

// Fetch Single Invoice
const fetchInvoice = asyncHandler(async (req, res) => {
  const invoice = await Invoice.findById(req.params.id)
    .populate("customerId")
    .populate("subtrips");

  if (!invoice) {
    res.status(404).json({ message: "Invoice not found" });
    return;
  }

  res.status(200).json(invoice);
});

// Update Invoice
const updateInvoice = asyncHandler(async (req, res) => {
  const updatedInvoice = await Invoice.findByIdAndUpdate(
    req.params.id,
    req.body,
    {
      new: true,
    }
  );
  res.status(200).json(updatedInvoice);
});

// Delete Invoice
const deleteInvoice = asyncHandler(async (req, res) => {
  const invoice = await Invoice.findById(req.params.id);

  if (!invoice) {
    res.status(404).json({ message: "Invoice not found" });
    return;
  }

  await Invoice.findByIdAndDelete(req.params.id);
  res.status(200).json({ message: "Invoice deleted successfully" });
});

module.exports = {
  createInvoice,
  fetchInvoices,
  fetchInvoice,
  updateInvoice,
  deleteInvoice,
};
