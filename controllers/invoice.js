const asyncHandler = require("express-async-handler");
const Invoice = require("../model/Invoice");
const Subtrip = require("../model/Subtrip");
const { INVOICE_STATUS, SUBTRIP_STATUS } = require("../constants/status");
const {
  recordSubtripEvent,
  SUBTRIP_EVENT_TYPES,
} = require("../helpers/subtrip-event-helper");

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

  // Update the status of the subtrips to "billed" and record events
  const subtrips = await Subtrip.find({
    _id: { $in: invoicedSubTrips },
    subtripStatus: SUBTRIP_STATUS.CLOSED,
    invoiceId: { $exists: false },
  });

  for (const subtrip of subtrips) {
    subtrip.subtripStatus = SUBTRIP_STATUS.BILLED_PENDING;
    subtrip.invoiceId = savedInvoice._id;

    // Record invoice generation event
    recordSubtripEvent(
      subtrip,
      SUBTRIP_EVENT_TYPES.INVOICE_GENERATED,
      {
        invoiceNo: savedInvoice.invoiceNo,
        amount: savedInvoice.totalAmount,
      },
      req.user
    );

    await subtrip.save();
  }

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
  const { invoiceStatus } = req.body;

  // Update invoice
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

  if (!updatedInvoice) {
    return res.status(404).json({ message: "Invoice not found" });
  }

  // Update subtrip statuses based on invoice status and record events
  let newSubtripStatus;
  switch (invoiceStatus) {
    case INVOICE_STATUS.PENDING:
      newSubtripStatus = SUBTRIP_STATUS.BILLED_PENDING;
      break;
    case INVOICE_STATUS.PAID:
      newSubtripStatus = SUBTRIP_STATUS.BILLED_PAID;
      break;
    case INVOICE_STATUS.OVERDUE:
      newSubtripStatus = SUBTRIP_STATUS.BILLED_OVERDUE;
      break;
  }

  if (newSubtripStatus) {
    const subtrips = await Subtrip.find({ invoiceId: req.params.id });

    for (const subtrip of subtrips) {
      subtrip.subtripStatus = newSubtripStatus;

      if (invoiceStatus === INVOICE_STATUS.PAID) {
        recordSubtripEvent(
          subtrip,
          SUBTRIP_EVENT_TYPES.INVOICE_PAID,
          {
            invoiceNo: updatedInvoice.invoiceNo,
            amount: updatedInvoice.totalAmount,
          },
          req.user
        );
      }

      await subtrip.save();
    }
  }

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
    { $set: { subtripStatus: SUBTRIP_STATUS.CLOSED, invoiceId: null } }
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
