const mongoose = require("mongoose");

const userSchema = mongoose.Schema(
  {
    displayName: {
      type: String,
      required: [true, "Name is required"],
    },
    email: {
      type: String,
      required: [true, "email is required"],
      unique: true,
    },
    password: {
      type: String,
      required: [true, "password is required"],
    },
    isAdmin: {
      type: Boolean,
      default: false,
    },
    role: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

userSchema.methods.matchPassword = async function (enteredPassword) {
  return enteredPassword === this.password;
};

module.exports = mongoose.model("User", userSchema);
