const asyncHandler = require("express-async-handler");
const Invoice = require("../model/Invoice");
const Subtrip = require("../model/Subtrip");
const Customer = require("../model/Customer");
const { INVOICE_STATUS, SUBTRIP_STATUS } = require("../constants/status");
const {
  recordSubtripEvent,
  SUBTRIP_EVENT_TYPES,
} = require("../helpers/subtrip-event-helper");

const { calculateInvoiceSummary } = require("../Utils/invoice-utils");

const createInvoice = asyncHandler(async (req, res) => {
  const {
    customerId,
    billingPeriod,
    subtripIds,
    additionalCharges = [],
    notes = "",
  } = req.body;

  // 1. Fetch customer to get invoicePayWithin
  const customer = await Customer.findById(customerId);
  if (!customer) {
    return res.status(404).json({ message: "Customer not found." });
  }

  // 2. Calculate dueDate based on invoicePayWithin
  const payWithin = customer.invoicePayWithin || 10;
  const dueDate = new Date(Date.now() + payWithin * 24 * 60 * 60 * 1000);

  // 3. Basic validations
  if (!Array.isArray(subtripIds) || subtripIds.length === 0) {
    return res
      .status(400)
      .json({ message: "No subtrips provided for invoicing." });
  }

  const session = await Invoice.startSession();
  session.startTransaction();

  try {
    // 4. Fetch and validate subtrips
    const subtrips = await Subtrip.find({
      _id: { $in: subtripIds },
      subtripStatus: SUBTRIP_STATUS.RECEIVED,
      invoiceId: null,
    })
      .populate({
        path: "tripId",
        populate: [{ path: "vehicleId" }, { path: "driverId" }],
      })
      .session(session);

    if (subtrips.length !== subtripIds.length) {
      const failedSubtrips = subtripIds.filter(
        (id) => !subtrips.some((sub) => sub._id.toString() === id.toString())
      );
      await session.abortTransaction();
      return res.status(400).json({
        message: "Some subtrips are either not received or already invoiced.",
        failedSubtrips,
      });
    }

    // 5. Prepare snapshot
    const subtripSnapshot = subtrips.map((st) => ({
      subtripId: st._id,
      consignee: st.consignee,
      unloadingPoint: st.unloadingPoint,
      vehicleNo: st.tripId?.vehicleId?.vehicleNo,
      rate: st.rate,
      loadingWeight: st.loadingWeight,
      shortageWeight: st.shortageWeight,
      shortageAmount: st.shortageAmount,
      freightAmount: (st.rate || 0) * (st.loadingWeight || 0),
      totalAmount:
        (st.rate || 0) * (st.loadingWeight || 0) - (st.shortageAmount || 0),
      startDate: st.startDate,
      invoiceNo: st.invoiceNo,
    }));

    // 6. Summary and tax
    const summary = calculateInvoiceSummary(
      { invoicedSubTrips: subtrips },
      customer
    );

    // 7. Save Invoice
    const invoice = new Invoice({
      customerId,
      billingPeriod,
      dueDate,
      notes,
      additionalCharges,
      taxBreakup: summary.taxBreakup,
      subtripSnapshot,
      invoicedSubTrips: subtripIds,
      totalAmountBeforeTax: summary.totalAmountBeforeTax,
      totalAfterTax: summary.totalAfterTax,
      invoiceStatus: INVOICE_STATUS.PENDING,
    });

    const savedInvoice = await invoice.save({ session });

    // 8. Update subtrips
    for (const subtrip of subtrips) {
      subtrip.invoiceId = savedInvoice._id;
      subtrip.subtripStatus = SUBTRIP_STATUS.BILLED_PENDING;

      recordSubtripEvent(
        subtrip,
        SUBTRIP_EVENT_TYPES.INVOICE_GENERATED,
        { invoiceNo: savedInvoice.invoiceNo, amount: summary.totalAfterTax },
        req.user
      );

      await subtrip.save({ session });
    }

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
  const invoices = await Invoice.find({}).populate(
    "customerId",
    "customerName cellNo"
  );

  res.status(200).json(invoices);
});

// Fetch Single Invoice
const fetchInvoice = asyncHandler(async (req, res) => {
  const invoice = await Invoice.findById(req.params.id)
    .populate("customerId") // full customer info
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
    return res.status(404).json({ message: "Invoice not found" });
  }

  res.status(200).json({
    ...invoice.toObject(),
  });
});

const deleteInvoice = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const session = await Invoice.startSession();
  session.startTransaction();

  try {
    // 1. Load invoice with subtrip refs
    const invoice = await Invoice.findById(id).session(session);

    if (!invoice) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "Invoice not found" });
    }

    // 2. Revert invoiceId on linked subtrips
    const subtrips = await Subtrip.find({
      _id: { $in: invoice.invoicedSubTrips },
    }).session(session);

    for (const subtrip of subtrips) {
      subtrip.invoiceId = null;
      subtrip.subtripStatus = SUBTRIP_STATUS.RECEIVED; // or logic-based status if needed

      recordSubtripEvent(
        subtrip,
        SUBTRIP_EVENT_TYPES.INVOICE_DELETED,
        {
          deletedInvoiceId: id,
          invoiceNo: invoice.invoiceNo,
        },
        req.user
      );

      await subtrip.save({ session });
    }

    // 3. Delete the invoice
    await Invoice.findByIdAndDelete(id).session(session);

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

module.exports = {
  createInvoice,
  fetchInvoices,
  fetchInvoice,
  updateInvoice,
  deleteInvoice,
};
