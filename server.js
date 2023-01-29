const express = require("express");
const connectDB = require("./config/db");
const { errorHandler } = require("./middlewares/ErrorHandler");
const dotenv = require("dotenv").config();
const port = process.env.PORT || 5001;
const app = express();

const cors = require("cors");

const registrationRouter = require("./routes/registration");
const userRouter = require("./routes/user");
const waitingRouter = require("./routes/waiting");
const issueRouter = require("./routes/issue");

connectDB();

app.use(express.json());
app.use(cors());

app.use("/api/students", registrationRouter);
app.use("/api/users", userRouter);
app.use("/api/waitings", waitingRouter);
app.use("/api/issues", issueRouter);

app.use(errorHandler);

app.listen(port, () => {
  console.log(`Server started on port ${port}`);
});
