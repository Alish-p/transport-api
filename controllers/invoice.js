const asyncHandler = require("express-async-handler");
const Invoice = require("../model/Invoice");
const Subtrip = require("../model/Subtrip");

const createInvoice = asyncHandler(async (req, res) => {
  const { invoicedSubTrips } = req.body;

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
    { _id: { $in: invoicedSubTrips }, subtripStatus: "closed" },
    { $set: { subtripStatus: "billed" } }
  );

  res.status(201).json(savedInvoice);
});

// Fetch All Invoices
const fetchInvoices = asyncHandler(async (req, res) => {
  const invoices = await Invoice.find()
    .populate("customerId")
    .populate("invoicedSubTrips");
  res.status(200).json(invoices);
});

// Fetch Single Invoice
const fetchInvoice = asyncHandler(async (req, res) => {
  const invoice = await Invoice.findById(req.params.id)
    .populate("customerId")
    .populate({
      path: "invoicedSubTrips",
      populate: {
        path: "tripId",
        populate: {
          path: "vehicleId",
        },
      },
    });

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
  )
    .populate("customerId")
    .populate({
      path: "invoicedSubTrips",
      populate: {
        path: "tripId",
        populate: {
          path: "vehicleId",
        },
      },
    });
  res.status(200).json(updatedInvoice);
});

const deleteInvoice = asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Find the invoice to be deleted
  const invoice = await Invoice.findById(id);

  if (!invoice) {
    return res.status(404).json({ message: "Invoice not found" });
  }

  // Revert the status of associated subtrips to "closed" and remove invoiceId
  await Subtrip.updateMany(
    { invoiceId: id },
    { $set: { subtripStatus: "closed", invoiceId: null } }
  );

  // Delete the invoice
  await Invoice.findByIdAndDelete(id);

  res.status(200).json({ message: "Invoice deleted successfully" });
});

module.exports = {
  createInvoice,
  fetchInvoices,
  fetchInvoice,
  updateInvoice,
  deleteInvoice,
};
