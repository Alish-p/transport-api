const asyncHandler = require("express-async-handler");
const WaitingModel = require("../model/Waiting");

const book = asyncHandler(async (req, res) => {
  const waiting = new WaitingModel({ ...req.body });
  const { _id, name, duration, mobileNumber, gender } = await waiting.save();

  res.status(201).json({
    _id,
    name,
    duration,
    mobileNumber,
    gender,
  });
});

const fetchBookings = asyncHandler(async (req, res) => {
  const bookings = await WaitingModel.find();

  res.status(200).json(bookings);
});

const deleteBooking = asyncHandler(async (req, res) => {
  const id = req.params.id;
  const bookings = await WaitingModel.findByIdAndDelete(id);

  res.status(200).json(bookings);
});

module.exports = {
  book,
  fetchBookings,
  deleteBooking,
};
