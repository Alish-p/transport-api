const asyncHandler = require("express-async-handler");
const StudentModel = require("../model/Student");
const RegistrationModel = require("../model/Registration");
const HalfDayRegistrationModel = require("../model/halfShiftRegistration");
const { addDays } = require("../Utils/dateUtil");

// Full day registrations
const newRegistration = asyncHandler(async (req, res) => {
  const {
    name,
    gender,
    age,
    mobileNumber,
    city,
    exam,
    seatNumber,
    fees,
    duration,
    startDate,
  } = req.body;

  let seats = await RegistrationModel.find(
    {
      endDate: { $gte: Date.now() },
    },
    { seatNumber: 1, _id: 0 }
  );

  seats = seats.map((i) => i["seatNumber"]);

  if (seats.includes(seatNumber)) {
    const err = new Error("Seat is not available.");
    err.status = 400;
    throw err;
  }

  const student = await new StudentModel({
    name,
    gender,
    age,
    mobileNumber,
    city,
    exam,
  }).save();

  const registration = await new RegistrationModel({
    seatNumber,
    fees,
    duration,
    startDate,
    student: student._id,
  }).save();

  res.status(201).json({ registration, student });
});

// Half day registrations
const newHalfRegistration = asyncHandler(async (req, res) => {
  const { name, gender, age, mobileNumber, city, exam, fees, duration, shift } =
    req.body;

  const student = await new StudentModel({
    name,
    gender,
    age,
    mobileNumber,
    city,
    exam,
  }).save();

  const registration = await new HalfDayRegistrationModel({
    fees,
    duration,
    shift,
    student: student._id,
  }).save();

  res.status(201).json({ registration, student });
});

// fetch All students
const fetchStudents = asyncHandler(async (req, res) => {
  const registrations = await RegistrationModel.find(
    {
      endDate: { $gte: new Date() },
    },
    { seatNumber: 1, startDate: 1, endDate: 1 }
  ).populate("student", "name gender mobileNumber");

  registrations.sort((a, b) => a.seatNumber - b.seatNumber);

  res.status(200).json(registrations);
});

// fetch All students Contact Numbers
const fetchContactNumbers = asyncHandler(async (req, res) => {
  let registrations = await RegistrationModel.find(
    {
      endDate: { $gte: new Date() },
    },
    { seatNumber: 1, _id: 0 }
  ).populate("student", "name mobileNumber");

  registrations.sort((a, b) => a.seatNumber - b.seatNumber);

  console.log(registrations);

  registrations = registrations.map(({ student, seatNumber }) => ({
    name: `${seatNumber}-${student.name}`,
    Phone: `${student.mobileNumber}`,
  }));

  res.status(200).json(registrations);
});

// fetch All Hlaf day registrations
const fetchHalfDayRegistrations = asyncHandler(async (req, res) => {
  const registrations = await HalfDayRegistrationModel.find(
    {
      endDate: { $gte: new Date() },
    },
    { _id: 1, startDate: 1, endDate: 1, shift: 1 }
  ).populate("student", "name gender mobileNumber");

  res.status(200).json(registrations);
});

// fetch expired and about to expire registration details
const fetchExpires = asyncHandler(async (req, res) => {
  let today = new Date();
  let end = new Date().setDate(today.getDate() + 6);
  let start = new Date().setDate(today.getDate() - 6);

  const expires = await RegistrationModel.find({
    endDate: { $gte: today, $lt: end },
  }).populate("student");

  const expired = await RegistrationModel.find({
    endDate: { $gte: start, $lt: today },
  }).populate("student");

  res.status(200).json({ expires, expired });
});

// fetch expired and about to expire registration details
const fetchTodaysData = asyncHandler(async (req, res) => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const registrations = await RegistrationModel.find({
    startDate: { $gte: today },
  }).populate("student");

  const renews = await RegistrationModel.find({
    renewDate: { $gte: today },
  }).populate("student");

  const HalfDayRegistrations = await HalfDayRegistrationModel.find({
    startDate: { $gte: today },
  }).populate("student");

  res.status(200).json({ registrations, renews, HalfDayRegistrations });
});

// fetch student by mobile number
const fetchStudentByNumber = asyncHandler(async (req, res) => {
  const mobileNumber = req.params.mobile;
  let registration;
  let halfDayRegistration;
  const student = await StudentModel.findOne({ mobileNumber }).sort({
    $natural: -1,
  });

  console.log();

  if (student) {
    registration =
      (await RegistrationModel.findOne({
        student: student._id,
      }).sort({
        $natural: -1,
      })) ||
      (await HalfDayRegistrationModel.findOne({
        student: student._id,
      }).sort({
        $natural: -1,
      }));
  } else {
    throw new Error("No Student exist");
  }

  if (!registration) throw new Error("No Registrations exist");

  console.log(student);
  console.log(registration);

  res.status(200).json({ registration, student });
});

// fetch available seats
const fetchAvailableSeats = asyncHandler(async (req, res) => {
  const registrations = await RegistrationModel.find(
    {
      endDate: { $gte: new Date() },
    },
    { seatNumber: 1, _id: 0 }
  ).populate("student", "gender");

  const total = [...Array(151).keys()];

  // to remove 0th seat
  total.shift();

  const filled = registrations.map((i) => ({
    seatNo: i.seatNumber,
    gender: i.student.gender,
    available: false,
  }));

  const filledarr = registrations.map((i) => i["seatNumber"]);

  for (let i = 1; i <= 150; i++) {
    if (!filledarr.includes(i)) {
      filled.push({ seatNo: i, available: true });
    }
  }

  filled.sort((a, b) => a.seatNo - b.seatNo);

  res.status(200).send(filled);
});

// Extend Member Ship by n days
const extendMembershipByDay = asyncHandler(async (req, res) => {
  const { days, fees = 0 } = req.body || {};
  const registration = await RegistrationModel.findById(req.params.id);

  const endDate = addDays(registration.endDate, days || 0);

  const updated =
    days <= 0 || fees == 0
      ? { endDate }
      : { endDate, renewFees: fees, renewDate: new Date() };
  const updatedRegistration = await RegistrationModel.findByIdAndUpdate(
    req.params.id,
    updated,
    { new: true }
  );

  res.status(200).json(updatedRegistration);
});

// Change seat
const changeSeat = asyncHandler(async (req, res) => {
  const { seatNumber, id } = req.body;

  let seats = await RegistrationModel.find(
    {
      endDate: { $gte: Date.now() },
    },
    { seatNumber: 1, _id: 0 }
  );

  seats = seats.map((i) => i["seatNumber"]);

  if (seats.includes(seatNumber)) {
    const err = new Error("Seat is not available.");
    err.status = 400;
    throw err;
  }

  const updatedRegistration = await RegistrationModel.findByIdAndUpdate(
    id,
    { seatNumber },
    { new: true }
  );

  res.status(200).json(updatedRegistration);
});

module.exports = {
  newRegistration,
  fetchStudents,
  fetchAvailableSeats,
  fetchStudentByNumber,
  fetchExpires,
  newHalfRegistration,
  fetchHalfDayRegistrations,
  extendMembershipByDay,
  changeSeat,
  fetchTodaysData,
  fetchContactNumbers,
};
