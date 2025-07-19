const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    mobile: { type: String, required: true, unique: true },
    address: { type: String, required: true },
    password: { type: String, required: true },
    designation: { type: String, required: true },
    tenant: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },

    permissions: {
      bank: {
        create: { type: Boolean, default: false },
        view: { type: Boolean, default: false },
        update: { type: Boolean, default: false },
        delete: { type: Boolean, default: false },
      },
      customer: {
        create: { type: Boolean, default: false },
        view: { type: Boolean, default: false },
        update: { type: Boolean, default: false },
        delete: { type: Boolean, default: false },
      },
      diesel: {
        create: { type: Boolean, default: false },
        view: { type: Boolean, default: false },
        update: { type: Boolean, default: false },
        delete: { type: Boolean, default: false },
      },
      driver: {
        create: { type: Boolean, default: false },
        view: { type: Boolean, default: false },
        update: { type: Boolean, default: false },
        delete: { type: Boolean, default: false },
      },
      driverSalary: {
        create: { type: Boolean, default: false },
        view: { type: Boolean, default: false },
        update: { type: Boolean, default: false },
        delete: { type: Boolean, default: false },
      },
      expense: {
        create: { type: Boolean, default: false },
        view: { type: Boolean, default: false },
        update: { type: Boolean, default: false },
        delete: { type: Boolean, default: false },
      },
      invoice: {
        create: { type: Boolean, default: false },
        view: { type: Boolean, default: false },
        update: { type: Boolean, default: false },
        delete: { type: Boolean, default: false },
      },
      loan: {
        create: { type: Boolean, default: false },
        view: { type: Boolean, default: false },
        update: { type: Boolean, default: false },
        delete: { type: Boolean, default: false },
      },
      pump: {
        create: { type: Boolean, default: false },
        view: { type: Boolean, default: false },
        update: { type: Boolean, default: false },
        delete: { type: Boolean, default: false },
      },
      route: {
        create: { type: Boolean, default: false },
        view: { type: Boolean, default: false },
        update: { type: Boolean, default: false },
        delete: { type: Boolean, default: false },
      },
      subtrip: {
        create: { type: Boolean, default: false },
        view: { type: Boolean, default: false },
        update: { type: Boolean, default: false },
        delete: { type: Boolean, default: false },
      },
      transporter: {
        create: { type: Boolean, default: false },
        view: { type: Boolean, default: false },
        update: { type: Boolean, default: false },
        delete: { type: Boolean, default: false },
      },
      transporterPayment: {
        create: { type: Boolean, default: false },
        view: { type: Boolean, default: false },
        update: { type: Boolean, default: false },
        delete: { type: Boolean, default: false },
      },
      trip: {
        create: { type: Boolean, default: false },
        view: { type: Boolean, default: false },
        update: { type: Boolean, default: false },
        delete: { type: Boolean, default: false },
      },
      user: {
        create: { type: Boolean, default: false },
        view: { type: Boolean, default: false },
        update: { type: Boolean, default: false },
        delete: { type: Boolean, default: false },
      },
      vehicle: {
        create: { type: Boolean, default: false },
        view: { type: Boolean, default: false },
        update: { type: Boolean, default: false },
        delete: { type: Boolean, default: false },
      },
    },

    bankDetails: {
      name: { type: String },
      branch: { type: String },
      ifsc: { type: String },
      place: { type: String },
      accNo: { type: String },
    },
  },
  { timestamps: true }
);
userSchema.methods.matchPassword = async function (enteredPassword) {
  return enteredPassword === this.password;
};

module.exports = mongoose.model("User", userSchema);
