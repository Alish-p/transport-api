const express = require("express");
const connectDB = require("./config/db");
const { errorHandler } = require("./middlewares/ErrorHandler");
const dotenv = require("dotenv").config();
const port = process.env.PORT || 5000;
const app = express();

const cors = require("cors");

const studentRouter = require("./routes/student");
const userRouter = require("./routes/user");
const waitingRouter = require("./routes/waiting");

connectDB();

app.use(express.json());
app.use(cors());

app.use("/api/students", studentRouter);
app.use("/api/users", userRouter);
app.use("/api/waitings", waitingRouter);

app.use(errorHandler);

app.listen(port, () => {
  console.log(`Server started on port ${port}`);
});
