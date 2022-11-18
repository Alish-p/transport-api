const mongoose = require('mongoose');

const schema = mongoose.Schema(
  {
    name: String,
    gender: String,
    age: Number,
    mobileNumber: { type: Number },
    city: String,
    exam: String,
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Student', schema);
