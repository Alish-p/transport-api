const asyncHandler = require("express-async-handler");
const WaitingModel = require("../model/Waiting");
const StudentModel = require("../model/Student");

const addWaiting = asyncHandler(async (req, res) => {
  // check if student already exists
  let student = await StudentModel.findOne({
    mobileNumber: req.body.mobileNumber,
  });

  if (!student) {
    // create new student
    student = await new StudentModel({ ...req.body }).save();
  }

  const { name, mobileNumber, gender } = student;

  const waiting = new WaitingModel({ ...req.body, student: student._id });
  const { _id: waitingID, duration } = await waiting.save();

  res.status(201).json({
    waitingID,
    name,
    duration,
    mobileNumber,
    gender,
  });
});

const fetchWaitings = asyncHandler(async (req, res) => {
  let bookings = await WaitingModel.find().populate(
    "student",
    "name gender mobileNumber"
  );

  bookings = bookings.map(
    ({ _id, duration, student: { name, gender, mobileNumber } }) => ({
      _id,
      duration,
      gender,
      mobileNumber,
      name,
    })
  );

  res.status(200).json(bookings);
});

const deleteWaiting = asyncHandler(async (req, res) => {
  const id = req.params.id;
  const bookings = await WaitingModel.findByIdAndDelete(id);

  res.status(200).json(bookings);
});

module.exports = {
  addWaiting,
  fetchWaitings,
  deleteWaiting,
};
