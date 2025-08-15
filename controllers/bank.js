const asyncHandler = require("express-async-handler");
const Bank = require("../model/Bank");
const { addTenantToQuery } = require("../utills/tenant-utils");

// Create Bank
const createBank = asyncHandler(async (req, res) => {
  const bank = new Bank({ ...req.body, tenant: req.tenant });
  const newBank = await bank.save();

  res.status(201).json(newBank);
});

// Fetch Banks with pagination and search
const fetchBanks = asyncHandler(async (req, res) => {
  try {
    const { search } = req.query;
    const { limit, skip } = req.pagination;

    const query = addTenantToQuery(req);

    if (search) {
      query.$or = [
        { ifsc: { $regex: search, $options: "i" } },
        { name: { $regex: search, $options: "i" } },
        { branch: { $regex: search, $options: "i" } },
      ];
    }

    const [banks, total] = await Promise.all([
      Bank.find(query).sort({ name: 1 }).skip(skip).limit(limit),
      Bank.countDocuments(query),
    ]);

    res.status(200).json({
      banks,
      total,
      startRange: skip + 1,
      endRange: skip + banks.length,
    });
  } catch (error) {
    res.status(500).json({
      message: "An error occurred while fetching paginated banks",
      error: error.message,
    });
  }
});

// Fetch Bank Details by ID
const fetchBankDetails = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const bank = await Bank.findOne({ _id: id, tenant: req.tenant });

  if (!bank) {
    res.status(404).json({ message: "Bank not found" });
    return;
  }

  res.status(200).json(bank);
});

// Update Bank
const updateBank = asyncHandler(async (req, res) => {
  console.log("bank is updating ");
  console.log({ req });

  const { id } = req.params;
  const bank = await Bank.findOneAndUpdate(
    { _id: id, tenant: req.tenant },
    req.body,
    { new: true }
  );

  res.status(200).json(bank);
});

// Delete Bank
const deleteBank = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const bank = await Bank.findOneAndDelete({ _id: id, tenant: req.tenant });

  res.status(200).json(bank);
});

module.exports = {
  createBank,
  fetchBanks,
  updateBank,
  deleteBank,
  fetchBankDetails,
};
