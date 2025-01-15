const asyncHandler = require("express-async-handler");
const TransporterPaymentReceipt = require("../model/TransporterPayment");

// Create a new Transporter Payment Receipt
const createTransporterPaymentReceipt = asyncHandler(async (req, res) => {
  // Create a new receipt
  const newReceipt = new TransporterPaymentReceipt({
    ...req.body,
    status: "pending",
    createdDate: new Date(),
  });

  // Save the new receipt
  const savedReceipt = await newReceipt.save();

  res.status(201).json(savedReceipt);
});

// Fetch All Transporter Payment Receipts
const fetchTransporterPaymentReceipts = asyncHandler(async (req, res) => {
  const receipts = await TransporterPaymentReceipt.find()
    .populate("transporterId")
    .populate("subtrips");
  res.status(200).json(receipts);
});

// Fetch Single Transporter Payment Receipt
const fetchTransporterPaymentReceipt = asyncHandler(async (req, res) => {
  const receipt = await TransporterPaymentReceipt.findById(req.params.id)
    .populate("transporterId")
    .populate({
      path: "subtrips",
      populate: {
        path: "tripId",
        populate: {
          path: "vehicleId",
        },
      },
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
  );
  res.status(200).json(updatedReceipt);
});

// Delete Transporter Payment Receipt
const deleteTransporterPaymentReceipt = asyncHandler(async (req, res) => {
  const receipt = await TransporterPaymentReceipt.findById(req.params.id);

  if (!receipt) {
    res.status(404).json({ message: "Transporter Payment Receipt not found" });
    return;
  }

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
