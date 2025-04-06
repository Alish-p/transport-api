const asyncHandler = require("express-async-handler");
const TransporterPaymentReceipt = require("../model/TransporterPayment");
const Loan = require("../model/Loan");
const Subtrip = require("../model/Subtrip");

// Create a new Transporter Payment Receipt
const createTransporterPaymentReceipt = asyncHandler(async (req, res) => {
  const { selectedLoans, associatedSubtrips } = req.body;

  // Deduct installment amounts from loans
  for (const loan of selectedLoans) {
    const existingLoan = await Loan.findById(loan._id);
    if (existingLoan) {
      existingLoan.remainingBalance -= loan.installmentAmount;
      existingLoan.installmentsPaid.push({
        amount: loan.installmentAmount,
        paidDate: new Date(),
      });

      // Check if remaining balance is 0, then mark loan as paid
      if (existingLoan.remainingBalance <= 0) {
        existingLoan.remainingBalance = 0;
        existingLoan.status = "paid";
      }

      await existingLoan.save();
    }
  }

  // Create a new receipt
  const newReceipt = new TransporterPaymentReceipt({
    ...req.body,
    status: "pending",
    createdDate: new Date(),
  });

  // Save the new receipt
  const savedReceipt = await newReceipt.save();

  await Subtrip.updateMany(
    {
      _id: { $in: associatedSubtrips },
      transporterPaymentReceiptId: { $exists: false },
    },
    { $set: { transporterPaymentReceiptId: savedReceipt._id } }
  );

  res.status(201).json(savedReceipt);
});

// Fetch All Transporter Payment Receipts
const fetchTransporterPaymentReceipts = asyncHandler(async (req, res) => {
  const receipts = await TransporterPaymentReceipt.find()
    .populate("transporterId")
    .populate({
      path: "associatedSubtrips",
      populate: [
        {
          path: "tripId",
          populate: {
            path: "vehicleId",
          },
        },
        { path: "expenses" },
        { path: "routeCd" },
      ],
    });
  res.status(200).json(receipts);
});

// Fetch Single Transporter Payment Receipt
const fetchTransporterPaymentReceipt = asyncHandler(async (req, res) => {
  const receipt = await TransporterPaymentReceipt.findById(req.params.id)
    .populate("transporterId")
    .populate({
      path: "associatedSubtrips",
      populate: [
        {
          path: "tripId",
          populate: {
            path: "vehicleId",
          },
        },
        { path: "expenses" },
        { path: "routeCd" },
      ],
    });

  if (!receipt) {
    res.status(404).json({ message: "Transporter Payment Receipt not found" });
    return;
  }

  res.status(200).json(receipt);
});

// Update Transporter Payment Receipt
const updateTransporterPaymentReceipt = asyncHandler(async (req, res) => {
  const updatedReceipt = await TransporterPaymentReceipt.findByIdAndUpdate(
    req.params.id,
    req.body,
    {
      new: true,
    }
  )
    .populate("transporterId")
    .populate({
      path: "associatedSubtrips",
      populate: {
        path: "tripId",
        populate: {
          path: "vehicleId",
        },
      },
    });
  res.status(200).json(updatedReceipt);
});

// Delete Transporter Payment Receipt
const deleteTransporterPaymentReceipt = asyncHandler(async (req, res) => {
  const receipt = await TransporterPaymentReceipt.findById(req.params.id);

  if (!receipt) {
    res.status(404).json({ message: "Transporter Payment Receipt not found" });
    return;
  }

  // remove the receipt id from the associated subtrips
  await Subtrip.updateMany(
    { transporterPaymentReceiptId: receipt._id },
    { $unset: { transporterPaymentReceiptId: "" } }
  );

  // remove from installmentsPaid from loans of id in selectedLoans
  await Loan.updateMany(
    { _id: { $in: receipt.selectedLoans } },
    { $pull: { installmentsPaid: { receiptId: receipt._id } } }
  );

  await TransporterPaymentReceipt.findByIdAndDelete(req.params.id);
  res
    .status(200)
    .json({ message: "Transporter Payment Receipt deleted successfully" });
});

module.exports = {
  createTransporterPaymentReceipt,
  fetchTransporterPaymentReceipts,
  fetchTransporterPaymentReceipt,
  updateTransporterPaymentReceipt,
  deleteTransporterPaymentReceipt,
};
