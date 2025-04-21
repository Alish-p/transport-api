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

  // 1. Validate payload
  if (!Array.isArray(invoicedSubTrips) || invoicedSubTrips.length === 0) {
    return res
      .status(400)
      .json({ message: "No subtrips provided for invoicing." });
  }

  // 2. Start a session for transaction
  const session = await Invoice.startSession();
  session.startTransaction();

  try {
    // 3. Lock eligible subtrips and ensure validity
    const subtrips = await Subtrip.find({
      _id: { $in: invoicedSubTrips },
      subtripStatus: SUBTRIP_STATUS.RECEIVED,
      invoiceId: { $exists: false },
    }).session(session);

    if (subtrips.length !== invoicedSubTrips.length) {
      await session.abortTransaction();
      return res.status(400).json({
        message: "Some subtrips are either not received or already invoiced.",
        failedSubtrips: invoicedSubTrips.filter(
          (id) => !subtrips.some((sub) => sub._id === id)
        ),
      });
    }

    // 4. Create the invoice
    const newInvoice = new Invoice({
      ...req.body,
      invoiceStatus: "pending",
      createdDate: new Date(),
    });

    const savedInvoice = await newInvoice.save({ session });

    // 5. Update subtrips atomically
    for (const subtrip of subtrips) {
      subtrip.subtripStatus = SUBTRIP_STATUS.BILLED_PENDING;
      subtrip.invoiceId = savedInvoice._id;

      recordSubtripEvent(
        subtrip,
        SUBTRIP_EVENT_TYPES.INVOICE_GENERATED,
        {
          invoiceNo: savedInvoice.invoiceNo,
          amount: savedInvoice.totalAmount,
        },
        req.user
      );

      await subtrip.save({ session });
    }

    // 6. Commit transaction
    await session.commitTransaction();
    session.endSession();

    res.status(201).json(savedInvoice);
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Invoice creation failed:", error);
    res
      .status(500)
      .json({ message: "Failed to create invoice", error: error.message });
  }
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

  // 1. Start a session for atomic operation
  const session = await Invoice.startSession();
  session.startTransaction();

  try {
    // 2. Find the invoice first
    const invoice = await Invoice.findById(id).session(session);
    if (!invoice) {
      await session.abortTransaction();
      return res.status(404).json({ message: "Invoice not found" });
    }

    // 3. Fetch affected subtrips
    const subtrips = await Subtrip.find({ invoiceId: id }).session(session);

    // 4. Update subtrips: revert invoice linkage
    for (const subtrip of subtrips) {
      subtrip.invoiceId = null;
      subtrip.subtripStatus = SUBTRIP_STATUS.RECEIVED; // Or "CLOSED" if appropriate

      recordSubtripEvent(
        subtrip,
        SUBTRIP_EVENT_TYPES.INVOICE_DELETED,
        { deletedInvoiceId: id },
        req.user
      );

      await subtrip.save({ session });
    }

    // 5. Delete the invoice
    await Invoice.findByIdAndDelete(id).session(session);

    // 6. Commit the transaction
    await session.commitTransaction();
    session.endSession();

    res.status(200).json({ message: "Invoice deleted successfully" });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Invoice deletion failed:", error);
    res
      .status(500)
      .json({ message: "Failed to delete invoice", error: error.message });
  }
});

module.exports = {
  createInvoice,
  fetchInvoices,
  fetchInvoice,
  updateInvoice,
  deleteInvoice,
};
