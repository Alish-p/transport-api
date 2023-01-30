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

  // check if seat is already taken
  const seat = await RegistrationModel.findOne({
    seatNumber,
    endDate: { $gte: Date.now() },
  });

  if (seat) {
    const err = new Error("Seat is not available.");
    err.status = 400;
    throw err;
  }

  // check if student already exists
  let student = await StudentModel.findOne({ mobileNumber });
  if (!student) {
    // create new student
    student = await new StudentModel({
      name,
      gender,
      age,
      mobileNumber,
      city,
      exam,
    }).save();
  }

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
  const {
    name,
    gender,
    age,
    mobileNumber,
    city,
    exam,
    fees,
    duration,
    shift,
    startDate,
  } = req.body;

  // check if student already exists
  let student = await StudentModel.findOne({ mobileNumber });
  if (!student) {
    // create new student
    student = await new StudentModel({
      name,
      gender,
      age,
      mobileNumber,
      city,
      exam,
    }).save();
  }

  const registration = await new HalfDayRegistrationModel({
    fees,
    duration,
    shift,
    startDate,
    student: student._id,
  }).save();

  res.status(201).json({ registration, student });
});

// fetch All full day registrations
const fetchFulldayRegistrations = asyncHandler(async (req, res) => {
  // Use the lean() method to retrieve plain javascript objects instead of mongoose documents
  const registrations = await RegistrationModel.find({
    endDate: { $gte: new Date() },
  })
    .select("seatNumber startDate endDate student")
    .populate("student", "name gender mobileNumber")
    .lean();

  // Sort the registrations by seatNumber
  registrations.sort((a, b) => {
    if (!isNaN(a.seatNumber) && !isNaN(b.seatNumber)) {
      return a.seatNumber - b.seatNumber;
    } else {
      return a.seatNumber.localeCompare(b.seatNumber);
    }
  });

  res.status(200).json(registrations);
});

// fetch All Hlaf day registrations
const fetchHalfDayRegistrations = asyncHandler(async (req, res) => {
  const registrations = await HalfDayRegistrationModel.find({
    endDate: { $gte: new Date() },
  })
    .select("_id startDate endDate shift student")
    .populate("student", "name gender mobileNumber")
    .lean();

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

// fetch expired and about to expire registration details
const fetchFulldayExpires = asyncHandler(async (req, res) => {
  let today = new Date();
  let end = new Date().setDate(today.getDate() + 6);
  let start = new Date().setDate(today.getDate() - 6);

  const expiresPromise = RegistrationModel.find({
    endDate: { $gte: today, $lt: end },
  })
    .populate("student")
    .lean();

  const expiredPromise = RegistrationModel.find({
    endDate: { $gte: start, $lt: today },
  })
    .populate("student")
    .lean();

  const [expires, expired] = await Promise.all([
    expiresPromise,
    expiredPromise,
  ]);

  res.status(200).json({ expires, expired });
});

// fetch expired and about to expire registration details
const fetchHalfDayExpires = asyncHandler(async (req, res) => {
  let today = new Date();
  let end = new Date().setDate(today.getDate() + 6);
  let start = new Date().setDate(today.getDate() - 6);

  const expiresPromise = HalfDayRegistrationModel.find({
    endDate: { $gte: today, $lt: end },
  })
    .populate("student")
    .lean();

  const expiredPromise = HalfDayRegistrationModel.find({
    endDate: { $gte: start, $lt: today },
  })
    .populate("student")
    .lean();

  const [expires, expired] = await Promise.all([
    expiresPromise,
    expiredPromise,
  ]);

  res.status(200).json({ expires, expired });
});

// fetch everyday's registration and renew data
const fetchTodaysData = asyncHandler(async (req, res) => {
  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  );
  const endOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    23,
    59,
    59
  );

  const registrationPromise = RegistrationModel.find({
    startDate: { $gte: startOfToday, $lt: endOfToday },
  })
    .populate("student")
    .lean();

  const renewsPromise = RegistrationModel.find({
    renewDate: { $gte: startOfToday, $lt: endOfToday },
  })
    .populate("student")
    .lean();

  const HalfDayRegistrationsPromise = HalfDayRegistrationModel.find({
    startDate: { $gte: startOfToday, $lt: endOfToday },
  })
    .populate("student")
    .lean();

  const [registrations, renews, HalfDayRegistrations] = await Promise.all([
    registrationPromise,
    renewsPromise,
    HalfDayRegistrationsPromise,
  ]);

  res.status(200).json({ registrations, renews, HalfDayRegistrations });
});

// fetch students registration detail by mobileNumber
const fetchStudentByNumber = asyncHandler(async (req, res) => {
  const mobileNumber = req.params.mobile;
  let registration;
  let student = await StudentModel.findOne({ mobileNumber });
  if (!student) {
    throw new Error("No student found with this mobile number");
  }
  registration = await RegistrationModel.findOne({ student: student._id }).sort(
    { startDate: -1 }
  );
  if (!registration) {
    registration = await HalfDayRegistrationModel.findOne({
      student: student._id,
    }).sort({ startDate: -1 });
    if (!registration)
      throw new Error("No registration found for this mobile number");
  }
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

// fetch All students
const fetchAllStudents = asyncHandler(async (req, res) => {
  let students = await StudentModel.find({});

  students.sort((a, b) => a.name - b.name);

  console.log(students);

  res.status(200).json({ count: students.length, students });
});

module.exports = {
  newRegistration,
  fetchFulldayRegistrations,
  fetchAvailableSeats,
  fetchStudentByNumber,
  fetchFulldayExpires,
  newHalfRegistration,
  fetchHalfDayRegistrations,
  extendMembershipByDay,
  changeSeat,
  fetchTodaysData,
  fetchContactNumbers,
  fetchHalfDayExpires,
  fetchAllStudents,
};
