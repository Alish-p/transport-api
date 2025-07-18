const { Schema, model } = require("mongoose");

const paymentHistorySchema = new Schema(
  {
    amount: { type: Number, required: true },
    paymentDate: { type: Date, required: true },
    paymentMethod: {
      type: String,
      enum: ["UPI", "Card", "BankTransfer", "Cash"],
      required: true,
    },
    status: {
      type: String,
      enum: ["SUCCESS", "FAILED", "PENDING"],
      default: "PENDING",
    },
    notes: String,
  },
  { _id: false }
);

const tenantSchema = new Schema(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    tagline: String,
    address: {
      line1: { type: String, required: true },
      line2: String,
      state: { type: String, required: true },
      city: { type: String, required: true },
      pincode: { type: String, required: true },
    },
    contactDetails: {
      email: { type: String, required: true },
      phoneNumbers: [{ type: String }],
      website: String,
    },
    legalInfo: {
      panNumber: String,
      gstNumber: String,
      registeredState: String,
    },
    bankDetails: {
      bankName: String,
      accountNumber: String,
      ifscCode: String,
    },
    subscription: {
      planName: String,
      validTill: Date,
      isActive: Boolean,
      createdAt: Date,
      updatedAt: Date,
    },
    paymentHistory: [paymentHistorySchema],
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = model("Tenant", tenantSchema);
